// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// CollaborationExecutor — agents take turns in a shared discussion thread,
// with configurable speaker selection and termination conditions.

import { supabase } from './supabase';
import { executeLLMCall } from './llmHelper';
import { writeTeamRunUsageRecord } from './usageWriter';
import { dispatchTeamRunWebhooks } from './webhookDispatcher';
import { storeTeamMemory, retrieveRelevantMemories, buildMemoryContext } from './teamMemory';
import type { TeamRun, Agent, CollaborationConfig, TokenUsage } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConversationMessage {
    agentId: string;
    agentName: string;
    content: string;
    turnIndex: number;
}

// ─── Main Collaboration Loop ─────────────────────────────────────────────────

export async function processCollaborationRun(run: TeamRun): Promise<void> {
    console.log(`[Collaboration] Processing run ${run.id}`);

    let totalTokens = 0;
    let totalCost = 0;

    try {
        // 1. Fetch team config
        const teamResponse = await supabase
            .from('teams')
            .select('config, mode')
            .eq('id', run.team_id)
            .single();

        if (teamResponse.error || !teamResponse.data) {
            throw new Error(`Failed to load team: ${teamResponse.error?.message ?? 'not found'}`);
        }

        const teamData = teamResponse.data as { config: CollaborationConfig; mode: string };
        const config = teamData.config;

        if (!config.agent_ids?.length || config.agent_ids.length < 2) {
            throw new Error('Collaboration requires at least 2 participating agents');
        }

        // 2. Fetch all participant agents
        const agentsResponse = await supabase
            .from('agents')
            .select('*')
            .in('id', config.agent_ids);

        const agents = (agentsResponse.data as Agent[] | null) ?? [];
        if (agents.length < 2) {
            throw new Error('Could not load at least 2 participating agents');
        }

        // Build agent lookup
        const agentMap = new Map<string, Agent>();
        for (const agent of agents) {
            agentMap.set(agent.id, agent);
        }

        // 3. Retrieve relevant team memories (non-blocking — errors never affect the run)
        let teamMemories: string[] = [];
        try {
            teamMemories = await retrieveRelevantMemories(run.team_id, run.workspace_id, run.input_task);
            if (teamMemories.length > 0) {
                console.log(`[Collaboration] Found ${teamMemories.length} relevant memories for team ${run.team_id}`);
            }
        } catch (memErr: unknown) {
            const msg = memErr instanceof Error ? memErr.message : String(memErr);
            console.warn(`[Collaboration] Memory retrieval failed (non-fatal): ${msg}`);
        }

        // 4. Record initial system message
        await recordMessage(run.id, null, 'system', `Collaboration started: ${run.input_task}`);

        // 4. Collaboration turn loop
        const conversation: ConversationMessage[] = [];
        let isDone = false;

        for (let turn = 0; turn < config.max_turns && !isDone; turn++) {
            // Select speaker
            const speakerId = await selectSpeaker(
                config,
                agents,
                conversation,
                turn,
                run,
                agentMap,
            );

            const speaker = agentMap.get(speakerId);
            if (!speaker) {
                console.warn(`[Collaboration] Speaker ${speakerId} not found, skipping turn ${turn}`);
                continue;
            }

            // Build prompt for speaker
            const systemPrompt = buildSpeakerSystemPrompt(speaker, agents, config);
            let userPrompt = buildTurnPrompt(run.input_task, conversation, speaker, turn, config);

            // Inject team memory context on the first turn
            if (turn === 0 && teamMemories.length > 0) {
                userPrompt += buildMemoryContext(teamMemories);
            }

            // Execute LLM call
            const result = await executeLLMCall({
                workspaceId: run.workspace_id,
                agentId: speakerId,
                systemPrompt,
                userPrompt,
                enableTools: true,
            });

            totalTokens += result.usage.totalTokens;
            totalCost += result.usage.costEstimateUSD;

            // Record to conversation history
            const message: ConversationMessage = {
                agentId: speakerId,
                agentName: speaker.name,
                content: result.result,
                turnIndex: turn,
            };
            conversation.push(message);

            // Record to team_messages (real-time)
            await recordMessage(run.id, speakerId, 'discussion', result.result, {
                turn_index: turn,
                model: result.model,
                tokens: result.usage.totalTokens,
                cost: result.usage.costEstimateUSD,
                tool_calls: result.toolCallLogs.length > 0 ? result.toolCallLogs : undefined,
            });

            // Write per-turn usage record
            await writeTeamRunUsageRecord({
                workspaceId: run.workspace_id,
                teamRunId: run.id,
                agentId: speakerId,
                provider: result.provider,
                model: result.model,
                stepIndex: turn,
                stepName: `Turn ${turn + 1}: ${speaker.name}`,
                tokensUsed: result.usage.totalTokens,
                promptTokens: result.usage.promptTokens,
                completionTokens: result.usage.completionTokens,
                costEstimateUsd: result.usage.costEstimateUSD,
            });

            // Update run progress
            await supabase
                .from('team_runs')
                .update({
                    current_step_idx: turn,
                    tokens_total: totalTokens,
                    cost_estimate_usd: totalCost,
                })
                .eq('id', run.id);

            // Check termination condition
            isDone = checkTermination(config, conversation, turn);
        }

        // 5. Synthesize final output
        const finalOutput = synthesizeOutput(conversation, config);

        await supabase
            .from('team_runs')
            .update({
                status: 'completed',
                output: finalOutput,
                current_step_idx: conversation.length - 1,
                tokens_total: totalTokens,
                cost_estimate_usd: totalCost,
                completed_at: new Date().toISOString(),
            })
            .eq('id', run.id);

        await recordMessage(run.id, null, 'system', `Collaboration completed after ${conversation.length} turns.`);

        console.log(`[Collaboration] Completed run ${run.id} (${conversation.length} turns, ${totalTokens} tokens)`);

        // Store output as team memory (fire-and-forget)
        void storeTeamMemory(run.team_id, run.id, run.workspace_id, finalOutput);

        // Fire webhook (fire-and-forget)
        void dispatchTeamRunWebhooks(
            { id: run.id, team_id: run.team_id, workspace_id: run.workspace_id, status: 'completed', input_task: run.input_task, output: finalOutput },
            `Collaboration Team ${run.team_id}`,
            'team_run.completed',
        );

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Collaboration] Failed run ${run.id}:`, errMsg);

        await supabase
            .from('team_runs')
            .update({
                status: 'failed',
                error_message: errMsg,
                completed_at: new Date().toISOString(),
                tokens_total: totalTokens,
                cost_estimate_usd: totalCost,
            })
            .eq('id', run.id);

        void dispatchTeamRunWebhooks(
            { id: run.id, team_id: run.team_id, workspace_id: run.workspace_id, status: 'failed', input_task: run.input_task, error_message: errMsg },
            `Collaboration Team ${run.team_id}`,
            'team_run.failed',
        );
    }
}

// ─── Speaker Selection ───────────────────────────────────────────────────────

async function selectSpeaker(
    config: CollaborationConfig,
    agents: Agent[],
    conversation: ConversationMessage[],
    turn: number,
    run: TeamRun,
    agentMap: Map<string, Agent>,
): Promise<string> {
    switch (config.speaker_selection) {
        case 'round_robin':
            return config.agent_ids[turn % config.agent_ids.length];

        case 'llm_select': {
            // Ask an LLM to pick the most relevant next speaker
            // Use the first agent as the selector (meta-agent)
            const selectorId = config.agent_ids[0];
            const agentList = agents
                .map((a) => `  - "${a.name}" (ID: ${a.id}): ${a.description || 'No description'}`)
                .join('\n');

            const recentMessages = conversation.slice(-5).map(
                (m) => `${m.agentName}: ${m.content.substring(0, 200)}`,
            ).join('\n');

            const selectionPrompt = `Given the following discussion participants:
${agentList}

Recent conversation:
${recentMessages || '(No messages yet — this is the opening turn)'}

Topic: ${run.input_task}

Which agent should speak next? Respond with ONLY the agent ID, nothing else.`;

            try {
                const result = await executeLLMCall({
                    workspaceId: run.workspace_id,
                    agentId: selectorId,
                    systemPrompt: 'You are a discussion moderator. Select the most appropriate next speaker. Respond with ONLY the agent ID.',
                    userPrompt: selectionPrompt,
                });

                // Try to extract an agent ID from the response
                const selectedId = result.result.trim();
                if (agentMap.has(selectedId)) {
                    return selectedId;
                }

                // Fallback: search for any known agent ID in the response
                for (const id of config.agent_ids) {
                    if (result.result.includes(id)) {
                        return id;
                    }
                }
            } catch {
                // LLM selection failed — fall through to round robin
            }

            // Fallback to round robin
            return config.agent_ids[turn % config.agent_ids.length];
        }

        case 'facilitator': {
            if (!config.facilitator_agent_id || !agentMap.has(config.facilitator_agent_id)) {
                // No valid facilitator — fall back to round robin
                return config.agent_ids[turn % config.agent_ids.length];
            }

            // On even turns the facilitator speaks, on odd turns they pick someone
            if (turn % 2 === 0 && turn > 0) {
                // Facilitator's turn to direct
                const nonFacilitator = config.agent_ids.filter((id) => id !== config.facilitator_agent_id);
                const agentList = nonFacilitator
                    .map((id) => {
                        const a = agentMap.get(id);
                        return a ? `  - "${a.name}" (ID: ${id})` : `  - Unknown (ID: ${id})`;
                    })
                    .join('\n');

                const recentMessages = conversation.slice(-3).map(
                    (m) => `${m.agentName}: ${m.content.substring(0, 200)}`,
                ).join('\n');

                try {
                    const result = await executeLLMCall({
                        workspaceId: run.workspace_id,
                        agentId: config.facilitator_agent_id,
                        systemPrompt: 'You are the discussion facilitator. Choose who should speak next. Respond with ONLY the agent ID.',
                        userPrompt: `Participants:\n${agentList}\n\nRecent:\n${recentMessages}\n\nWho should speak next? Respond with ONLY the agent ID.`,
                    });

                    const selectedId = result.result.trim();
                    if (agentMap.has(selectedId) && selectedId !== config.facilitator_agent_id) {
                        return selectedId;
                    }

                    for (const id of nonFacilitator) {
                        if (result.result.includes(id)) {
                            return id;
                        }
                    }
                } catch {
                    // Facilitator selection failed
                }

                // Fallback: pick next non-facilitator via round robin
                return nonFacilitator[Math.floor(turn / 2) % nonFacilitator.length];
            }

            // Facilitator speaks on first turn and odd turns
            return config.facilitator_agent_id;
        }

        default:
            return config.agent_ids[turn % config.agent_ids.length];
    }
}

// ─── Prompt Builders ─────────────────────────────────────────────────────────

function buildSpeakerSystemPrompt(
    speaker: Agent,
    allAgents: Agent[],
    config: CollaborationConfig,
): string {
    const otherAgents = allAgents
        .filter((a) => a.id !== speaker.id)
        .map((a) => `  - ${a.name}: ${a.description || 'No description'}`)
        .join('\n');

    const basePrompt = speaker.system_prompt || 'You are a helpful AI assistant.';

    // Inject voice profile if configured
    let voiceBlock = '';
    if (speaker.voice_profile) {
        const vp = speaker.voice_profile;
        const voiceSections: string[] = [];
        if (vp.tone) voiceSections.push(`Tone: ${vp.tone}`);
        if (vp.custom_instructions) voiceSections.push(vp.custom_instructions);
        if (vp.output_format_hints) voiceSections.push(`Output format: ${vp.output_format_hints}`);
        if (voiceSections.length > 0) {
            voiceBlock = `\n\n## Voice & Tone\n${voiceSections.join('\n')}`;
        }
    }

    return `${basePrompt}${voiceBlock}

You are participating in a collaborative discussion with other agents:
${otherAgents}

RULES:
- Engage constructively with what others have said
- Build on previous points rather than repeating them
- Be concise and focused
- If you agree with the group consensus, include the phrase "${config.consensus_phrase}" in your response
${config.termination_condition === 'facilitator_decision' && config.facilitator_agent_id === speaker.id
            ? '- As the facilitator, you may end the discussion by saying "DISCUSSION COMPLETE" when consensus is reached'
            : ''}`;
}

function buildTurnPrompt(
    task: string,
    conversation: ConversationMessage[],
    speaker: Agent,
    turn: number,
    config: CollaborationConfig,
): string {
    const parts: string[] = [];

    parts.push(`## Discussion Topic\n${task}`);

    if (conversation.length > 0) {
        const threadLines = conversation.map(
            (m) => `**${m.agentName}** (Turn ${m.turnIndex + 1}):\n${m.content}`,
        ).join('\n\n---\n\n');
        parts.push(`## Discussion So Far\n${threadLines}`);
    } else {
        parts.push('## Your Role\nYou are opening the discussion. Share your initial thoughts on the topic.');
    }

    parts.push(`## Your Turn\nIt is now your turn to contribute (Turn ${turn + 1} of ${config.max_turns}). Respond as ${speaker.name}.`);

    return parts.join('\n\n');
}

// ─── Termination Checking ────────────────────────────────────────────────────

function checkTermination(
    config: CollaborationConfig,
    conversation: ConversationMessage[],
    currentTurn: number,
): boolean {
    // Always stop at max turns
    if (currentTurn >= config.max_turns - 1) {
        return true;
    }

    switch (config.termination_condition) {
        case 'max_turns':
            return false; // Only stops at max_turns (checked above)

        case 'consensus': {
            // Check if the last N messages (one from each agent) contain the consensus phrase
            const recentMessages = conversation.slice(-config.agent_ids.length);
            if (recentMessages.length < 2) return false;

            const consensusCount = recentMessages.filter(
                (m) => m.content.toLowerCase().includes(config.consensus_phrase.toLowerCase()),
            ).length;

            // Consensus reached when majority of recent speakers agree
            return consensusCount >= Math.ceil(recentMessages.length / 2);
        }

        case 'facilitator_decision': {
            // Check if the facilitator's last message contains the termination signal
            const lastFacilitatorMsg = [...conversation]
                .reverse()
                .find((m) => m.agentId === config.facilitator_agent_id);

            if (!lastFacilitatorMsg) return false;
            return lastFacilitatorMsg.content.includes('DISCUSSION COMPLETE');
        }

        default:
            return false;
    }
}

// ─── Output Synthesis ────────────────────────────────────────────────────────

function synthesizeOutput(
    conversation: ConversationMessage[],
    _config: CollaborationConfig,
): string {
    if (conversation.length === 0) {
        return 'No discussion took place.';
    }

    const threadLines = conversation.map(
        (m) => `**${m.agentName}** (Turn ${m.turnIndex + 1}):\n${m.content}`,
    ).join('\n\n---\n\n');

    // Return the last message as the primary output, with full thread as context
    const lastMessage = conversation[conversation.length - 1];

    return `## Collaboration Result

### Final Contribution (${lastMessage.agentName})
${lastMessage.content}

### Full Discussion Thread (${conversation.length} turns)

${threadLines}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function recordMessage(
    runId: string,
    agentId: string | null,
    messageType: string,
    content: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    await supabase.from('team_messages').insert({
        run_id: runId,
        sender_agent_id: agentId,
        message_type: messageType,
        content: content.substring(0, 10000), // Cap message length
        metadata: metadata ?? null,
    });
}
