// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// OrchestratorExecutor — brain agent delegates to workers via tool calls,
// evaluates quality, requests revision, and produces final output.

import { supabase } from './supabase';
import { executeLLMCall } from './llmHelper';
import { writeTeamRunUsageRecord } from './usageWriter';
import { dispatchTeamRunWebhooks } from './webhookDispatcher';
import { storeTeamMemory, retrieveRelevantMemories, buildMemoryContext } from './teamMemory';
import type { TeamRun, Agent, OrchestratorConfig, Delegation, TokenUsage } from './types';

// ─── Tool Definitions ────────────────────────────────────────────────────────

const ORCHESTRATOR_TOOLS = [
    {
        name: 'delegate_to_worker',
        description: 'Delegate a subtask to a specific worker agent. The worker will execute and return a result.',
        parameters: {
            type: 'object',
            properties: {
                agent_id: { type: 'string', description: 'The ID of the worker agent to delegate to' },
                instruction: { type: 'string', description: 'The specific instruction/subtask for the worker' },
            },
            required: ['agent_id', 'instruction'],
        },
    },
    {
        name: 'request_revision',
        description: 'Request a revision from a worker on a previous delegation. Include feedback on what to improve.',
        parameters: {
            type: 'object',
            properties: {
                delegation_id: { type: 'string', description: 'The ID of the delegation to revise' },
                feedback: { type: 'string', description: 'Feedback for the worker on what to improve' },
            },
            required: ['delegation_id', 'feedback'],
        },
    },
    {
        name: 'accept_result',
        description: 'Accept a worker delegation result as satisfactory.',
        parameters: {
            type: 'object',
            properties: {
                delegation_id: { type: 'string', description: 'The ID of the delegation to accept' },
            },
            required: ['delegation_id'],
        },
    },
    {
        name: 'final_answer',
        description: 'Submit the final aggregated answer. Call this when all delegations are complete and you have synthesized the results.',
        parameters: {
            type: 'object',
            properties: {
                output: { type: 'string', description: 'The final synthesized output' },
            },
            required: ['output'],
        },
    },
];

// ─── Brain System Prompt Builder ─────────────────────────────────────────────

function buildBrainSystemPrompt(workers: Agent[], config: OrchestratorConfig): string {
    const workerList = workers
        .map((w) => `  - Agent "${w.name}" (ID: ${w.id}): ${w.description || 'No description'}`)
        .join('\n');

    return `You are an orchestrator agent managing a team of AI workers. Your job is to:

1. Analyze the incoming task
2. Break it down into subtasks
3. Delegate subtasks to the most appropriate worker
4. Evaluate each worker's output for quality
5. Request revisions if the quality is below threshold (${config.quality_threshold * 100}%)
6. Synthesize all accepted results into a final answer

AVAILABLE WORKERS:
${workerList}

HOW TO USE TOOLS:
You MUST invoke tools by outputting a JSON code block with a "tool" field and an "arguments" field. Do NOT just describe what you want to do — you must output the JSON.

To delegate a task to a worker:
\`\`\`json
{"tool": "delegate_to_worker", "arguments": {"agent_id": "<WORKER_ID>", "instruction": "<WHAT_TO_DO>"}}
\`\`\`

To request a revision:
\`\`\`json
{"tool": "request_revision", "arguments": {"delegation_id": "<DELEGATION_ID>", "feedback": "<WHAT_TO_IMPROVE>"}}
\`\`\`

To accept a satisfactory result:
\`\`\`json
{"tool": "accept_result", "arguments": {"delegation_id": "<DELEGATION_ID>"}}
\`\`\`

To submit your final synthesized answer (call this when ALL work is done):
\`\`\`json
{"tool": "final_answer", "arguments": {"output": "<YOUR_FINAL_OUTPUT>"}}
\`\`\`

RULES:
- You MUST output a JSON tool call block for every action you take
- You can delegate to multiple workers sequentially
- Maximum ${config.max_delegation_depth} revision rounds per delegation
- Always evaluate worker output before accepting
- Call "final_answer" when you have a complete, high-quality result
- Be specific in your delegation instructions
- Provide constructive feedback when requesting revisions`;
}

// ─── Main Orchestrator Loop ──────────────────────────────────────────────────

export async function processOrchestratorRun(run: TeamRun): Promise<void> {
    console.log(`[Orchestrator] Processing run ${run.id}`);

    let totalTokens = 0;
    let totalCost = 0;

    try {
        // 1. Fetch team to get config
        const teamResponse = await supabase
            .from('teams')
            .select('config, mode')
            .eq('id', run.team_id)
            .single();

        if (teamResponse.error || !teamResponse.data) {
            throw new Error(`Failed to load team: ${teamResponse.error?.message ?? 'not found'}`);
        }

        const teamData = teamResponse.data as { config: OrchestratorConfig; mode: string };
        const config = teamData.config;

        if (!config.brain_agent_id || !config.worker_agent_ids?.length) {
            throw new Error('Orchestrator config missing brain_agent_id or worker_agent_ids');
        }

        // 2. Fetch all worker agents
        const workersResponse = await supabase
            .from('agents')
            .select('*')
            .in('id', config.worker_agent_ids);

        const workers = (workersResponse.data as Agent[] | null) ?? [];
        if (workers.length === 0) {
            throw new Error('No worker agents found for this orchestrator team');
        }

        // 3. Retrieve relevant team memories (non-blocking — errors never affect the run)
        let teamMemories: string[] = [];
        try {
            teamMemories = await retrieveRelevantMemories(run.team_id, run.workspace_id, run.input_task);
            if (teamMemories.length > 0) {
                console.log(`[Orchestrator] Found ${teamMemories.length} relevant memories for team ${run.team_id}`);
            }
        } catch (memErr: unknown) {
            const msg = memErr instanceof Error ? memErr.message : String(memErr);
            console.warn(`[Orchestrator] Memory retrieval failed (non-fatal): ${msg}`);
        }

        // 4. Build brain system prompt with memory context
        let brainSystemPrompt = buildBrainSystemPrompt(workers, config);
        if (teamMemories.length > 0) {
            brainSystemPrompt += buildMemoryContext(teamMemories);
        }
        const userPrompt = `Task to orchestrate:\n\n${run.input_task}`;

        // 4. Record initial brain message
        await recordMessage(run.id, config.brain_agent_id, 'system', `Orchestrating task: ${run.input_task}`);

        // 5. Orchestrator tool-use loop
        // We simulate the tool-use loop by calling the brain agent iteratively.
        // Each iteration: brain decides what to do → we execute the tool → feed result back.
        const conversationHistory: Array<{ role: string; content: string }> = [];
        conversationHistory.push({ role: 'user', content: userPrompt });

        let isDone = false;
        let loopCount = 0;
        const maxLoops = 20; // Safety limit
        const delegations: Map<string, Delegation> = new Map();

        while (!isDone && loopCount < maxLoops) {
            loopCount++;

            // Call brain agent
            const brainResult = await executeLLMCall({
                workspaceId: run.workspace_id,
                agentId: config.brain_agent_id,
                systemPrompt: brainSystemPrompt,
                userPrompt: buildConversationPrompt(conversationHistory),
            });

            totalTokens += brainResult.usage.totalTokens;
            totalCost += brainResult.usage.costEstimateUSD;

            // Parse brain response for tool calls
            const toolCall = parseToolCall(brainResult.result);

            if (!toolCall) {
                // Brain gave a text response without a tool call — treat as final answer
                await finalizeRun(run.id, brainResult.result, totalTokens, totalCost);
                isDone = true;
                break;
            }

            // Execute the tool call
            const toolResult = await executeToolCall(
                toolCall,
                run,
                config,
                delegations,
                workers,
            );

            totalTokens += toolResult.tokensUsed;
            totalCost += toolResult.costUsed;

            // Add to conversation history
            conversationHistory.push({
                role: 'assistant',
                content: `[Tool Call: ${toolCall.name}] ${JSON.stringify(toolCall.arguments)}`,
            });
            conversationHistory.push({
                role: 'tool',
                content: toolResult.result,
            });

            if (toolResult.isDone) {
                isDone = true;
            }

            // Update run progress
            await supabase
                .from('team_runs')
                .update({
                    tokens_total: totalTokens,
                    cost_estimate_usd: totalCost,
                    delegation_depth: loopCount,
                })
                .eq('id', run.id);
        }

        if (!isDone) {
            // Loop exhausted — finalize with what we have
            const lastOutputs = Array.from(delegations.values())
                .filter((d) => d.status === 'completed')
                .map((d) => d.worker_output)
                .filter(Boolean)
                .join('\n\n---\n\n');

            await finalizeRun(
                run.id,
                lastOutputs || 'Orchestrator reached maximum loop count without producing a final answer.',
                totalTokens,
                totalCost,
            );
        }

        // Write usage record
        await writeTeamRunUsageRecord({
            workspaceId: run.workspace_id,
            teamRunId: run.id,
            agentId: config.brain_agent_id,
            provider: 'multi',
            model: 'orchestrator',
            stepIndex: 0,
            stepName: 'orchestrator',
            tokensUsed: totalTokens,
            costEstimateUsd: totalCost,
        });

        console.log(`[Orchestrator] Completed run ${run.id} (${loopCount} loops, ${totalTokens} tokens)`);

        // Store output as team memory (fire-and-forget)
        const completedRun = await supabase.from('team_runs').select('output').eq('id', run.id).single();
        const runOutput = (completedRun.data as { output: string | null } | null)?.output;
        if (runOutput) {
            void storeTeamMemory(run.team_id, run.id, run.workspace_id, runOutput);
        }

        // Fire team_run.completed webhook (fire-and-forget)
        void dispatchTeamRunWebhooks(
            { id: run.id, team_id: run.team_id, workspace_id: run.workspace_id, status: 'completed', input_task: run.input_task },
            `Orchestrator Team ${run.team_id}`,
            'team_run.completed',
        );

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Orchestrator] Failed run ${run.id}:`, errMsg);

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

        // Fire team_run.failed webhook (fire-and-forget)
        void dispatchTeamRunWebhooks(
            { id: run.id, team_id: run.team_id, workspace_id: run.workspace_id, status: 'failed', input_task: run.input_task, error_message: errMsg },
            `Orchestrator Team ${run.team_id}`,
            'team_run.failed',
        );
    }
}

// ─── Tool Call Execution ─────────────────────────────────────────────────────

interface ToolResult {
    result: string;
    tokensUsed: number;
    costUsed: number;
    isDone: boolean;
}

async function executeToolCall(
    toolCall: { name: string; arguments: Record<string, unknown> },
    run: TeamRun,
    config: OrchestratorConfig,
    delegations: Map<string, Delegation>,
    workers: Agent[],
): Promise<ToolResult> {
    const args = toolCall.arguments;

    switch (toolCall.name) {
        case 'delegate_to_worker': {
            const agentId = args.agent_id as string;
            const instruction = args.instruction as string;

            // Validate worker exists
            const worker = workers.find((w) => w.id === agentId);
            if (!worker) {
                return { result: `Error: Worker agent ${agentId} not found in team.`, tokensUsed: 0, costUsed: 0, isDone: false };
            }

            // Create delegation record
            const delegationResponse = await supabase
                .from('delegations')
                .insert({
                    team_run_id: run.id,
                    worker_agent_id: agentId,
                    instruction,
                    status: 'running',
                })
                .select()
                .single();

            const delegation = delegationResponse.data as Delegation | null;
            if (!delegation) {
                return { result: 'Error: Failed to create delegation record.', tokensUsed: 0, costUsed: 0, isDone: false };
            }

            await recordMessage(run.id, agentId, 'delegation', `Brain delegated to "${worker.name}": ${instruction}`);

            // Execute worker
            try {
                const workerResult = await executeLLMCall({
                    workspaceId: run.workspace_id,
                    agentId,
                    systemPrompt: worker.system_prompt || 'You are a helpful AI assistant.',
                    userPrompt: instruction,
                    enableTools: true,
                });

                // Update delegation
                await supabase
                    .from('delegations')
                    .update({
                        worker_output: workerResult.result,
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                    })
                    .eq('id', delegation.id);

                delegation.worker_output = workerResult.result;
                delegation.status = 'completed';
                delegations.set(delegation.id, delegation);

                await recordMessage(run.id, agentId, 'worker_result', `Worker "${worker.name}" result: ${workerResult.result.substring(0, 500)}...`, {
                    tool_calls: workerResult.toolCallLogs.length > 0 ? workerResult.toolCallLogs : undefined,
                });

                return {
                    result: `Worker "${worker.name}" completed. Delegation ID: ${delegation.id}\n\nResult:\n${workerResult.result}`,
                    tokensUsed: workerResult.usage.totalTokens,
                    costUsed: workerResult.usage.costEstimateUSD,
                    isDone: false,
                };
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await supabase.from('delegations').update({ status: 'failed' }).eq('id', delegation.id);
                return { result: `Error executing worker "${worker.name}": ${errMsg}`, tokensUsed: 0, costUsed: 0, isDone: false };
            }
        }

        case 'request_revision': {
            const delegationId = args.delegation_id as string;
            const feedback = args.feedback as string;

            const delegation = delegations.get(delegationId);
            if (!delegation) {
                return { result: `Error: Delegation ${delegationId} not found.`, tokensUsed: 0, costUsed: 0, isDone: false };
            }

            if (delegation.revision_count >= config.max_delegation_depth) {
                return {
                    result: `Error: Maximum revision depth (${config.max_delegation_depth}) reached for delegation ${delegationId}. Please accept or skip.`,
                    tokensUsed: 0, costUsed: 0, isDone: false,
                };
            }

            // Update delegation status
            await supabase
                .from('delegations')
                .update({
                    status: 'revision_requested',
                    revision_feedback: feedback,
                    revision_count: delegation.revision_count + 1,
                })
                .eq('id', delegationId);

            const worker = workers.find((w) => w.id === delegation.worker_agent_id);
            const workerName = worker?.name ?? 'Unknown';

            await recordMessage(run.id, delegation.worker_agent_id, 'revision_request', `Brain requested revision from "${workerName}": ${feedback}`);

            // Re-execute worker with feedback
            const revisionPrompt = `Original instruction: ${delegation.instruction}\n\nPrevious output:\n${delegation.worker_output}\n\nRevision feedback:\n${feedback}\n\nPlease revise your output based on the feedback above.`;

            try {
                const workerResult = await executeLLMCall({
                    workspaceId: run.workspace_id,
                    agentId: delegation.worker_agent_id,
                    systemPrompt: worker?.system_prompt || 'You are a helpful AI assistant.',
                    userPrompt: revisionPrompt,
                    enableTools: true,
                });

                await supabase
                    .from('delegations')
                    .update({
                        worker_output: workerResult.result,
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                    })
                    .eq('id', delegationId);

                delegation.worker_output = workerResult.result;
                delegation.status = 'completed';
                delegation.revision_count += 1;
                delegations.set(delegationId, delegation);

                await recordMessage(run.id, delegation.worker_agent_id, 'worker_result', `Worker "${workerName}" revised result: ${workerResult.result.substring(0, 500)}...`, {
                    tool_calls: workerResult.toolCallLogs.length > 0 ? workerResult.toolCallLogs : undefined,
                });

                return {
                    result: `Worker "${workerName}" revised output (revision ${delegation.revision_count}). Delegation ID: ${delegationId}\n\nRevised Result:\n${workerResult.result}`,
                    tokensUsed: workerResult.usage.totalTokens,
                    costUsed: workerResult.usage.costEstimateUSD,
                    isDone: false,
                };
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                return { result: `Error during revision: ${errMsg}`, tokensUsed: 0, costUsed: 0, isDone: false };
            }
        }

        case 'accept_result': {
            const delegationId = args.delegation_id as string;
            const delegation = delegations.get(delegationId);
            if (!delegation) {
                return { result: `Error: Delegation ${delegationId} not found.`, tokensUsed: 0, costUsed: 0, isDone: false };
            }

            await supabase
                .from('delegations')
                .update({ status: 'completed', quality_score: config.quality_threshold })
                .eq('id', delegationId);

            await recordMessage(run.id, delegation.worker_agent_id, 'system', `Brain accepted delegation ${delegationId}`);

            return {
                result: `Delegation ${delegationId} accepted.`,
                tokensUsed: 0, costUsed: 0, isDone: false,
            };
        }

        case 'final_answer': {
            const output = args.output as string;
            await finalizeRun(run.id, output, 0, 0); // tokens/cost already tracked
            return { result: 'Final answer submitted.', tokensUsed: 0, costUsed: 0, isDone: true };
        }

        default:
            return { result: `Unknown tool: ${toolCall.name}`, tokensUsed: 0, costUsed: 0, isDone: false };
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseToolCall(brainOutput: string): { name: string; arguments: Record<string, unknown> } | null {
    // Strategy 1: Look for explicit tool call format: {"tool": "name", ...}
    const explicitPattern = /\{[\s\S]*?"(?:tool|name|function)"\s*:\s*"(delegate_to_worker|request_revision|accept_result|final_answer)"[\s\S]*?\}/;
    const explicitMatch = brainOutput.match(explicitPattern);
    if (explicitMatch) {
        try {
            const parsed = JSON.parse(explicitMatch[0]) as Record<string, unknown>;
            const name = (parsed.tool ?? parsed.name ?? parsed.function) as string;
            const args = (parsed.arguments ?? parsed.params ?? parsed) as Record<string, unknown>;
            if (['delegate_to_worker', 'request_revision', 'accept_result', 'final_answer'].includes(name)) {
                return { name, arguments: args };
            }
        } catch {
            // Failed, try next strategy
        }
    }

    // Strategy 2: Look for JSON code blocks and infer tool name from surrounding text
    const codeBlockPattern = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
    let codeMatch: RegExpExecArray | null;
    while ((codeMatch = codeBlockPattern.exec(brainOutput)) !== null) {
        try {
            const parsed = JSON.parse(codeMatch[1]) as Record<string, unknown>;

            // Check if this JSON block itself names the tool
            const toolName = (parsed.tool ?? parsed.name ?? parsed.function) as string | undefined;
            if (toolName && ['delegate_to_worker', 'request_revision', 'accept_result', 'final_answer'].includes(toolName)) {
                const args = (parsed.arguments ?? parsed.params ?? parsed) as Record<string, unknown>;
                return { name: toolName, arguments: args };
            }

            // Infer tool from the JSON shape and surrounding text
            if (parsed.agent_id && parsed.instruction) {
                return { name: 'delegate_to_worker', arguments: parsed };
            }
            if (parsed.delegation_id && parsed.feedback) {
                return { name: 'request_revision', arguments: parsed };
            }
            if (parsed.delegation_id && !parsed.feedback) {
                return { name: 'accept_result', arguments: parsed };
            }
            if (parsed.output) {
                return { name: 'final_answer', arguments: parsed };
            }
        } catch {
            // JSON parse failed, try next match
        }
    }

    // Strategy 3: Look for bare JSON objects (not in code blocks) with known shapes
    const bareJsonPattern = /\{[^{}]*"agent_id"\s*:\s*"[^"]+"\s*,\s*"instruction"\s*:\s*"[^"]*(?:\\.[^"]*)*"[^{}]*\}/;
    const bareMatch = brainOutput.match(bareJsonPattern);
    if (bareMatch) {
        try {
            const parsed = JSON.parse(bareMatch[0]) as Record<string, unknown>;
            return { name: 'delegate_to_worker', arguments: parsed };
        } catch {
            // Failed
        }
    }

    // Strategy 4: Check if text mentions a tool name followed by any JSON
    const textToolPattern = /(?:delegate_to_worker|delegate|Delegate)\b[\s\S]*?(\{[\s\S]*?\})/i;
    const textMatch = brainOutput.match(textToolPattern);
    if (textMatch) {
        try {
            const parsed = JSON.parse(textMatch[1]) as Record<string, unknown>;
            if (parsed.agent_id || parsed.instruction) {
                return { name: 'delegate_to_worker', arguments: parsed };
            }
        } catch {
            // Failed
        }
    }

    // Strategy 5: Check for final_answer intent without JSON
    const finalPattern = /final.?answer/i;
    if (finalPattern.test(brainOutput) && brainOutput.includes('"output"')) {
        const jsonPattern = /\{[\s\S]*?"output"\s*:\s*"[\s\S]*?"\s*\}/;
        const finalMatch = brainOutput.match(jsonPattern);
        if (finalMatch) {
            try {
                const parsed = JSON.parse(finalMatch[0]) as Record<string, unknown>;
                return { name: 'final_answer', arguments: parsed };
            } catch {
                // Failed
            }
        }
    }

    return null;
}

function buildConversationPrompt(history: Array<{ role: string; content: string }>): string {
    return history
        .map((msg) => {
            if (msg.role === 'user') return `USER: ${msg.content}`;
            if (msg.role === 'assistant') return `ASSISTANT: ${msg.content}`;
            if (msg.role === 'tool') return `TOOL RESULT: ${msg.content}`;
            return msg.content;
        })
        .join('\n\n');
}

async function recordMessage(
    runId: string,
    agentId: string,
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

async function finalizeRun(
    runId: string,
    output: string,
    extraTokens: number,
    extraCost: number,
): Promise<void> {
    // Fetch current totals to add any extra
    const currentResponse = await supabase
        .from('team_runs')
        .select('tokens_total, cost_estimate_usd')
        .eq('id', runId)
        .single();

    const current = currentResponse.data as { tokens_total: number; cost_estimate_usd: number } | null;

    await supabase
        .from('team_runs')
        .update({
            status: 'completed',
            output,
            tokens_total: (current?.tokens_total ?? 0) + extraTokens,
            cost_estimate_usd: (current?.cost_estimate_usd ?? 0) + extraCost,
            completed_at: new Date().toISOString(),
        })
        .eq('id', runId);
}
