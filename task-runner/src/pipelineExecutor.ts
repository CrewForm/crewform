import { supabase } from './supabase';
import { executeAnthropic } from './providers/anthropic';
import { executeOpenAI } from './providers/openai';
import { executeGoogle } from './providers/google';
import { decryptApiKey } from './crypto';
import { writeTeamRunUsageRecord } from './usageWriter';
import { dispatchTeamRunWebhooks } from './webhookDispatcher';
import { loadInputFiles, buildFileContext, extractAndSaveArtifacts } from './fileAttachments';
import { storeTeamMemory, retrieveRelevantMemories, buildMemoryContext } from './teamMemory';
import { executeWithToolLoop, getToolDefinitions } from './toolExecutor';
import type { CustomToolConfig, ToolCallLog } from './toolExecutor';
import type { TeamRun, Agent, ApiKey, PipelineConfig, PipelineStep, TeamHandoffContext, TokenUsage } from './types';

/**
 * PipelineExecutor — processes a team run by executing pipeline steps sequentially.
 *
 * For each step:
 * 1. Update current_step_idx on the run
 * 2. Build handoff context from previous output
 * 3. Record handoff + delegation message
 * 4. Execute LLM call
 * 5. Record result message
 * 6. Handle failures (retry / stop / skip)
 */
export async function processPipelineRun(run: TeamRun): Promise<void> {
    let totalTokens = 0;
    let totalCost = 0;
    let teamData: { name: string; mode: string; config: PipelineConfig; output_route_ids: string[] | null } | null = null;

    try {
        console.log(`[PipelineExecutor] Starting run ${run.id} for team ${run.team_id}`);

        // 1. Fetch team config
        const teamResponse = await supabase
            .from('teams')
            .select('name, mode, config, output_route_ids')
            .eq('id', run.team_id)
            .single();

        if (teamResponse.error) {
            throw new Error(`Failed to load team: ${teamResponse.error.message}`);
        }

        teamData = teamResponse.data as { name: string; mode: string; config: PipelineConfig; output_route_ids: string[] | null };

        if (teamData.mode !== 'pipeline') {
            throw new Error(`Team mode "${teamData.mode}" is not yet supported. Only "pipeline" is available.`);
        }

        const config = teamData.config;
        const steps = config.steps;

        if (steps.length === 0) {
            throw new Error('Pipeline has no steps configured.');
        }

        // 2. Load input files for the team run
        const inputFiles = await loadInputFiles(null, run.id);
        let fileContextBlock = '';
        if (inputFiles.length > 0) {
            // Peek at first step's agent model to determine multimodal support
            const { data: firstAgent } = await supabase
                .from('agents')
                .select('model')
                .eq('id', steps[0].agent_id)
                .single();
            const model = (firstAgent as { model: string } | null)?.model ?? '';
            const { textBlock } = buildFileContext(inputFiles, model);
            fileContextBlock = textBlock;
            console.log(`[PipelineExecutor] Loaded ${inputFiles.length} input file(s) for run ${run.id}`);
        }

        // Retrieve relevant team memories for context (non-blocking — errors never affect the run)
        let teamMemories: string[] = [];
        try {
            teamMemories = await retrieveRelevantMemories(run.team_id, run.workspace_id, run.input_task);
            if (teamMemories.length > 0) {
                console.log(`[PipelineExecutor] Found ${teamMemories.length} relevant memories for team ${run.team_id}`);
            }
        } catch (memErr: unknown) {
            const msg = memErr instanceof Error ? memErr.message : String(memErr);
            console.warn(`[PipelineExecutor] Memory retrieval failed (non-fatal): ${msg}`);
        }

        // 3. Execute each step sequentially
        const accumulatedOutputs: string[] = [];
        let previousOutput: string | null = null;

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const stepOutput = await executeStep({
                run,
                step,
                stepIndex: i,
                inputTask: run.input_task,
                previousOutput,
                accumulatedOutputs,
                fileContextBlock: i === 0 ? fileContextBlock : '',
                teamMemories: i === 0 ? teamMemories : [],
            });

            if (stepOutput !== null) {
                accumulatedOutputs.push(stepOutput.output);
                previousOutput = stepOutput.output;
                totalTokens += stepOutput.usage.totalTokens;
                totalCost += stepOutput.usage.costEstimateUSD;

                // Write usage record for this step
                await writeTeamRunUsageRecord({
                    workspaceId: run.workspace_id,
                    teamRunId: run.id,
                    agentId: step.agent_id,
                    provider: stepOutput.agentProvider,
                    model: stepOutput.agentModel,
                    stepIndex: i,
                    stepName: step.step_name,
                    tokensUsed: stepOutput.usage.totalTokens,
                    costEstimateUsd: stepOutput.usage.costEstimateUSD,
                });
            }

            // Update run totals progressively
            await supabase
                .from('team_runs')
                .update({
                    tokens_total: totalTokens,
                    cost_estimate_usd: totalCost,
                })
                .eq('id', run.id);
        }

        // 3. Finalize run as completed
        const finalOutput = previousOutput ?? '';

        await supabase
            .from('team_runs')
            .update({
                status: 'completed',
                output: finalOutput,
                current_step_idx: steps.length - 1,
                tokens_total: totalTokens,
                cost_estimate_usd: totalCost,
                completed_at: new Date().toISOString(),
            })
            .eq('id', run.id);

        console.log(`[PipelineExecutor] Run ${run.id} completed (${steps.length} steps, ${totalTokens} tokens, $${totalCost.toFixed(4)})`);

        // Store output as team memory (fire-and-forget)
        void storeTeamMemory(run.team_id, run.id, run.workspace_id, finalOutput);

        // Extract output file artifacts (fire-and-forget)
        void extractAndSaveArtifacts(run.workspace_id, null, run.id, finalOutput);

        // Fire team_run.completed webhook (fire-and-forget)
        void dispatchTeamRunWebhooks(
            { id: run.id, team_id: run.team_id, workspace_id: run.workspace_id, status: 'completed', input_task: run.input_task, output: finalOutput },
            teamData.name,
            'team_run.completed',
            teamData.output_route_ids,
        );

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[PipelineExecutor] Run ${run.id} failed:`, errMsg);

        await supabase
            .from('team_runs')
            .update({
                status: 'failed',
                error_message: errMsg,
                tokens_total: totalTokens,
                cost_estimate_usd: totalCost,
                completed_at: new Date().toISOString(),
            })
            .eq('id', run.id);

        // Fire team_run.failed webhook (fire-and-forget)
        void dispatchTeamRunWebhooks(
            { id: run.id, team_id: run.team_id, workspace_id: run.workspace_id, status: 'failed', input_task: run.input_task, error_message: errMsg },
            teamData?.name ?? `Team ${run.team_id}`,
            'team_run.failed',
            teamData?.output_route_ids ?? null,
        );
    }
}

// ─── Step Execution ──────────────────────────────────────────────────────────

interface StepInput {
    run: TeamRun;
    step: PipelineStep;
    stepIndex: number;
    inputTask: string;
    previousOutput: string | null;
    accumulatedOutputs: string[];
    fileContextBlock?: string;
    teamMemories?: string[];
}

interface StepResult {
    output: string;
    usage: TokenUsage;
    agentProvider: string;
    agentModel: string;
}

async function executeStep(input: StepInput): Promise<StepResult | null> {
    const { run, step, stepIndex, inputTask, previousOutput, accumulatedOutputs, fileContextBlock, teamMemories } = input;
    let attempts = 0;
    const maxAttempts = step.on_failure === 'retry' ? step.max_retries + 1 : 1;

    // Update current step on the run (real-time progress)
    await supabase
        .from('team_runs')
        .update({ current_step_idx: stepIndex })
        .eq('id', run.id);

    while (attempts < maxAttempts) {
        attempts++;

        try {
            console.log(`[PipelineExecutor] Step ${stepIndex + 1}/${step.step_name} (attempt ${attempts}/${maxAttempts})`);

            // Build handoff context
            const handoffContext: TeamHandoffContext = {
                input: inputTask,
                previous_output: previousOutput,
                step_index: stepIndex,
                step_name: step.step_name,
                accumulated_outputs: accumulatedOutputs,
                team_memories: teamMemories,
            };

            // Record handoff
            await supabase.from('team_handoffs').insert({
                run_id: run.id,
                from_agent_id: stepIndex > 0 ? getPreviousAgentId() : null,
                to_agent_id: step.agent_id,
                direction: 'forward',
                context: handoffContext,
                step_idx: stepIndex,
            });

            // Record delegation message
            await supabase.from('team_messages').insert({
                run_id: run.id,
                sender_agent_id: null, // system
                receiver_agent_id: step.agent_id,
                message_type: 'delegation',
                content: step.instructions || `Execute step: ${step.step_name}`,
                metadata: { step_index: stepIndex, attempt: attempts },
                step_idx: stepIndex,
                tokens_used: 0,
            });

            // Fetch agent
            const agentResponse = await supabase
                .from('agents')
                .select('*')
                .eq('id', step.agent_id)
                .single();

            const agent = agentResponse.data as Agent | null;
            if (!agent) {
                throw new Error(`Agent not found for step "${step.step_name}"`);
            }

            // Fetch API key
            const keyResponse = await supabase
                .from('api_keys')
                .select('*')
                .eq('workspace_id', run.workspace_id)
                .eq('provider', agent.provider)
                .single();

            const apiKeyData = keyResponse.data as ApiKey | null;
            if (!apiKeyData) {
                throw new Error(`No API key configured for provider ${agent.provider}`);
            }

            const rawKey = decryptApiKey(apiKeyData.encrypted_key);

            // Build prompt with handoff context
            const systemPrompt = agent.system_prompt || 'You are a helpful AI assistant.';
            let userPrompt = buildStepPrompt(step, handoffContext);

            // Append file context for the first step
            if (fileContextBlock) {
                userPrompt += fileContextBlock;
            }

            // Execute LLM — check if agent has tools for tool-use mode
            const agentTools: string[] = Array.isArray(agent.tools) ? agent.tools : [];
            const hasTools = agentTools.length > 0;
            let executionResult: { result: string; usage: TokenUsage };
            let toolCallLogs: ToolCallLog[] = [];
            const provider = agent.provider.toLowerCase();

            // Base URL map for OpenAI-compatible providers
            const baseURLMap: Record<string, string> = {
                openrouter: 'https://openrouter.ai/api/v1',
                groq: 'https://api.groq.com/openai/v1',
                mistral: 'https://api.mistral.ai/v1',
                cohere: 'https://api.cohere.com/compatibility/v1',
                together: 'https://api.together.xyz/v1',
                nvidia: 'https://integrate.api.nvidia.com/v1',
                huggingface: 'https://api-inference.huggingface.co/v1',
                venice: 'https://api.venice.ai/api/v1',
                minimax: 'https://api.minimaxi.chat/v1',
                moonshot: 'https://api.moonshot.cn/v1',
                perplexity: 'https://api.perplexity.ai',
            };

            // Strip provider prefix from model name if needed
            let effectiveModel = agent.model;
            if (provider === 'openrouter') {
                effectiveModel = agent.model.replace(/^openrouter\//, '');
            } else if (provider === 'groq') {
                effectiveModel = agent.model.replace(/^groq\//, '');
            }

            if (hasTools) {
                // ── Tool-Use Mode ──
                console.log(`[PipelineExecutor] Step ${stepIndex + 1} agent has ${agentTools.length} tools: ${agentTools.join(', ')}`);

                // Fetch Serper API key if web_search is enabled
                let serperApiKey: string | undefined;
                if (agentTools.includes('web_search')) {
                    const serperKeyResult = await supabase
                        .from('api_keys')
                        .select('*')
                        .eq('workspace_id', run.workspace_id)
                        .eq('provider', 'serper')
                        .single();
                    const serperKeyData = serperKeyResult.data as ApiKey | null;
                    if (serperKeyData) {
                        serperApiKey = decryptApiKey(serperKeyData.encrypted_key);
                    } else {
                        console.warn('[PipelineExecutor] web_search enabled but no Serper API key found');
                    }
                }

                // Fetch custom tools if any
                let customToolConfigs: CustomToolConfig[] = [];
                const hasCustomTools = agentTools.some(t => t.startsWith('custom:'));
                if (hasCustomTools) {
                    const customToolIds = agentTools.filter(t => t.startsWith('custom:')).map(t => t.replace('custom:', ''));
                    const ctResult = await supabase.from('custom_tools').select('*').in('id', customToolIds);
                    if (ctResult.data) customToolConfigs = ctResult.data as CustomToolConfig[];
                }

                // Use OpenAI SDK for tool-use (all providers are OpenAI-compatible)
                const OpenAI = (await import('openai')).default;
                const baseURL = baseURLMap[provider];
                const openai = new OpenAI({ apiKey: rawKey, ...(baseURL ? { baseURL } : {}) });
                const tools = getToolDefinitions(agentTools, customToolConfigs);

                const toolLoopResult = await executeWithToolLoop(
                    async (messages, toolDefs) => {
                        const openaiMessages = messages.map(m => {
                            if (m.role === 'system') return { role: 'system' as const, content: m.content ?? '' };
                            if (m.role === 'user') return { role: 'user' as const, content: m.content ?? '' };
                            if (m.role === 'tool') return { role: 'tool' as const, content: m.content ?? '', tool_call_id: m.tool_call_id ?? '' };
                            const assistantMsg: { role: 'assistant'; content: string; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] } = {
                                role: 'assistant' as const,
                                content: m.content ?? '',
                            };
                            if (m.tool_calls && m.tool_calls.length > 0) {
                                assistantMsg.tool_calls = m.tool_calls.map(tc => ({
                                    id: tc.id,
                                    type: 'function' as const,
                                    function: { name: tc.function.name, arguments: tc.function.arguments },
                                }));
                            }
                            return assistantMsg;
                        });

                        const response = await openai.chat.completions.create({
                            model: effectiveModel,
                            messages: openaiMessages,
                            tools: toolDefs,
                            ...(agent.max_tokens != null ? { max_tokens: agent.max_tokens } : {}),
                        });

                        const choice = response.choices[0];
                        const msg = choice?.message;
                        const tc = msg?.tool_calls?.map(t => ({
                            id: t.id,
                            function: {
                                name: (t as { function: { name: string; arguments: string } }).function.name,
                                arguments: (t as { function: { name: string; arguments: string } }).function.arguments,
                            },
                        }));

                        return {
                            message: { role: 'assistant' as const, content: msg?.content ?? null, tool_calls: tc },
                            usage: { promptTokens: response.usage?.prompt_tokens ?? 0, completionTokens: response.usage?.completion_tokens ?? 0 },
                        };
                    },
                    systemPrompt,
                    userPrompt,
                    agentTools,
                    customToolConfigs,
                    serperApiKey,
                );

                void tools; // used internally
                executionResult = { result: toolLoopResult.result, usage: toolLoopResult.usage };
                toolCallLogs = toolLoopResult.toolCallLogs;
                console.log(`[PipelineExecutor] Step ${stepIndex + 1} tool-use complete. ${toolLoopResult.toolCallsMade} tool calls made.`);
            } else {
                // ── Direct LLM Mode (no tools) ──
                const noopStream = async () => { /* no streaming for pipeline steps */ };

                if (provider === 'anthropic') {
                    executionResult = await executeAnthropic(rawKey, effectiveModel, systemPrompt, userPrompt, noopStream);
                } else if (provider === 'google') {
                    executionResult = await executeGoogle(rawKey, effectiveModel, systemPrompt, userPrompt, noopStream);
                } else if (provider === 'openai' || baseURLMap[provider]) {
                    const baseURL = baseURLMap[provider];
                    executionResult = await executeOpenAI(rawKey, effectiveModel, systemPrompt, userPrompt, noopStream, baseURL);
                } else {
                    throw new Error(`Provider "${provider}" is not supported.`);
                }
            }

            // Record result message
            await supabase.from('team_messages').insert({
                run_id: run.id,
                sender_agent_id: step.agent_id,
                receiver_agent_id: null, // broadcast
                message_type: 'result',
                content: executionResult.result,
                metadata: {
                    step_index: stepIndex,
                    model: agent.model,
                    tokens: executionResult.usage.totalTokens,
                    cost: executionResult.usage.costEstimateUSD,
                    tool_calls: toolCallLogs.length > 0 ? toolCallLogs : undefined,
                },
                step_idx: stepIndex,
                tokens_used: executionResult.usage.totalTokens,
            });

            return {
                output: executionResult.result,
                usage: executionResult.usage,
                agentProvider: agent.provider,
                agentModel: agent.model,
            };

        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error(`[PipelineExecutor] Step ${stepIndex + 1} failed (attempt ${attempts}):`, errMsg);

            // Record failure message
            await supabase.from('team_messages').insert({
                run_id: run.id,
                sender_agent_id: step.agent_id,
                receiver_agent_id: null,
                message_type: 'system',
                content: `Step "${step.step_name}" failed (attempt ${attempts}/${maxAttempts}): ${errMsg}`,
                metadata: { step_index: stepIndex, attempt: attempts, error: errMsg },
                step_idx: stepIndex,
                tokens_used: 0,
            });

            if (attempts >= maxAttempts) {
                // All retries exhausted
                if (step.on_failure === 'skip') {
                    console.log(`[PipelineExecutor] Skipping step ${stepIndex + 1} after failure.`);
                    await supabase.from('team_messages').insert({
                        run_id: run.id,
                        sender_agent_id: null,
                        receiver_agent_id: null,
                        message_type: 'system',
                        content: `Skipped step "${step.step_name}" due to failure.`,
                        metadata: { step_index: stepIndex, skipped: true },
                        step_idx: stepIndex,
                        tokens_used: 0,
                    });
                    return null; // Skip — continue pipeline with no output from this step
                }

                // on_failure === 'stop' or 'retry' exhausted
                throw new Error(`Step "${step.step_name}" failed after ${attempts} attempt(s): ${errMsg}`);
            }

            // Will retry on next loop iteration
            console.log(`[PipelineExecutor] Retrying step ${stepIndex + 1}...`);
        }
    }

    // Should never reach here
    return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPreviousAgentId(): string | null {
    // This is a simplified lookup — in a real implementation we'd track this
    // For now, we don't have the previous step's agent_id in scope
    // The handoff record will have from_agent_id = null for step 0
    return null;
}

function buildStepPrompt(step: PipelineStep, context: TeamHandoffContext): string {
    const parts: string[] = [];

    parts.push(`## Task\n${context.input}`);

    if (context.previous_output) {
        parts.push(`## Previous Step Output\nThe previous step in this pipeline produced the following output:\n\n${context.previous_output}`);
    }

    if (step.instructions) {
        parts.push(`## Your Instructions\n${step.instructions}`);
    }

    if (step.expected_output) {
        parts.push(`## Expected Output Format\n${step.expected_output}`);
    }

    if (context.accumulated_outputs.length > 1) {
        parts.push(`## Pipeline Context\nThis is step ${context.step_index + 1} in a multi-step pipeline. ${context.accumulated_outputs.length} previous steps have completed.`);
    }

    // Inject team memory context
    if (context.team_memories && context.team_memories.length > 0) {
        parts.push(buildMemoryContext(context.team_memories));
    }

    return parts.join('\n\n');
}
