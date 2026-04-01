import { supabase } from './supabase';
import { executeAnthropic } from './providers/anthropic';
import { executeOpenAI } from './providers/openai';
import { executeGoogle } from './providers/google';
import { decryptApiKey } from './crypto';
import { writeTaskUsageRecord } from './usageWriter';
import { dispatchWebhooks, replyToSourceChannel } from './webhookDispatcher';
import { executeWithToolLoop, getToolDefinitions } from './toolExecutor';
import { loadInputFiles, buildFileContext, extractAndSaveArtifacts } from './fileAttachments';
import { connectToServer, discoverTools, disconnectAll as disconnectMcpClients } from './mcpClient';
import type { McpServerConfig } from './mcpClient';
import { agUiEventBus, AgUiEventType } from './agUiEventBus';
import type { ToolDefinition } from './toolExecutor';
import type { CustomToolConfig, ToolCallLog } from './toolExecutor';
import type { Task, Agent, ApiKey, TokenUsage } from './types';

interface AgentTaskRecord {
    id: string;
    status: string;
}

/**
 * Derive provider from model name when agent.provider is null.
 * Maps well-known model prefixes to their provider.
 */
function inferProvider(model: string): string | null {
    const m = model.toLowerCase();
    // Prefix checks FIRST — must take priority over keyword matches
    if (m.startsWith('openrouter/')) return 'openrouter';
    if (m.startsWith('groq/')) return 'groq';
    // Then keyword matches
    if (m.includes('claude')) return 'anthropic';
    if (m.includes('gpt') || m.includes('o1') || m.includes('o3')) return 'openai';
    if (m.includes('gemini')) return 'google';
    if (m.includes('mistral') || m.includes('codestral')) return 'mistral';
    if (m.includes('command-r')) return 'cohere';
    // New providers
    if (m.includes('togethercomputer') || m.includes('together/')) return 'together';
    if (m.includes('nvidia/') || m.includes('nim/')) return 'nvidia';
    if (m.includes('minimax')) return 'minimax';
    if (m.includes('moonshot')) return 'moonshot';
    if (m.includes('sonar')) return 'perplexity';
    return null;
}

export async function processTask(task: Task) {
    // Find the auto-created agent_tasks record (created by DB trigger on dispatch)
    let agentTaskId: string | null = null;
    let agent: Agent | null = null;

    try {
        console.log(`[TaskRunner] Claimed task ${task.id} (Agent: ${task.assigned_agent_id})`);

        if (!task.assigned_agent_id) {
            throw new Error('Task has no assigned agent.');
        }

        // 0. Fetch the auto-dispatched agent_tasks record
        const agentTaskResponse = await supabase
            .from('agent_tasks')
            .select('id, status')
            .eq('task_id', task.id)
            .eq('agent_id', task.assigned_agent_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        const agentTask = agentTaskResponse.data as AgentTaskRecord | null;
        if (agentTask) {
            agentTaskId = agentTask.id;
            // Mark agent_task as running
            await supabase
                .from('agent_tasks')
                .update({ status: 'running', started_at: new Date().toISOString() })
                .eq('id', agentTaskId);
        }

        // 1. Fetch Agent
        const agentResponse = await supabase
            .from('agents')
            .select('*')
            .eq('id', task.assigned_agent_id)
            .single();

        agent = agentResponse.data as Agent | null;
        const agentError = agentResponse.error;

        if (agentError || !agent) {
            throw new Error(`Failed to load agent: ${agentError?.message}`);
        }

        // 1b. Mark agent as busy
        await supabase
            .from('agents')
            .update({ status: 'busy' })
            .eq('id', agent.id);

        // Support model override from task metadata (used by admin test runs)
        const effectiveModel = (typeof task.metadata?.model_override === 'string' && task.metadata.model_override)
            ? task.metadata.model_override
            : agent.model;
        if (effectiveModel !== agent.model) {
            console.log(`[TaskRunner] Model override active: using "${effectiveModel}" instead of agent default "${agent.model}"`);
        }

        // Derive provider from model name first (authoritative), fall back to stored value
        const provider = inferProvider(effectiveModel) ?? agent.provider;
        if (!provider) {
            throw new Error(`Cannot determine provider for agent "${agent.name}" with model "${effectiveModel}". Please update the agent's provider in Settings.`);
        }

        // 2. Fetch API Key for Agent's provider
        const apiKeyResponse = await supabase
            .from('api_keys')
            .select('*')
            .eq('workspace_id', task.workspace_id)
            .eq('provider', provider.toLowerCase())
            .single();

        const apiKeyData = apiKeyResponse.data as ApiKey | null;
        const keyError = apiKeyResponse.error;

        if (keyError || !apiKeyData) {
            throw new Error(`Failed to load API key for provider "${provider}". Please configure it in Settings.`);
        }

        const rawKey = decryptApiKey(apiKeyData.encrypted_key);

        // 3. Prepare Prompt (with attached files)
        let systemPrompt = agent.system_prompt || 'You are a helpful AI assistant.';

        // Inject voice profile into system prompt if configured
        if (agent.voice_profile) {
            const vp = agent.voice_profile;
            const voiceSections: string[] = [];
            if (vp.tone) voiceSections.push(`Tone: ${vp.tone}`);
            if (vp.custom_instructions) voiceSections.push(vp.custom_instructions);
            if (vp.output_format_hints) voiceSections.push(`Output format: ${vp.output_format_hints}`);
            if (voiceSections.length > 0) {
                systemPrompt += `\n\n## Voice & Tone\n${voiceSections.join('\n')}`;
            }
        }

        let userPrompt = `Task Title: ${task.title}\n\nTask Description:\n${task.description}`;

        // Load input file attachments
        const inputFiles = await loadInputFiles(task.id, null);
        if (inputFiles.length > 0) {
            const { textBlock } = buildFileContext(inputFiles, effectiveModel);
            if (textBlock) userPrompt += textBlock;
            console.log(`[TaskRunner] Loaded ${inputFiles.length} input file(s) for task ${task.id}`);
        }

        // 3b. Fire task.started webhook (fire-and-forget)
        void dispatchWebhooks(
            { id: task.id, title: task.title, workspace_id: task.workspace_id, status: 'running' },
            { id: agent.id, name: agent.name },
            'task.started',
        );

        // AG-UI: Run started
        agUiEventBus.emit(task.id, {
            type: AgUiEventType.RUN_STARTED,
            timestamp: Date.now(),
            threadId: task.id,
            runId: task.id,
        });

        // Throttle DB updates to avoid rate limits (every ~500ms at most)
        let lastUpdate = 0;
        const updateResultStream = async (text: string) => {
            const now = Date.now();
            if (now - lastUpdate > 500) {
                lastUpdate = now;
                await supabase
                    .from('tasks')
                    .update({ result: text }) // Store the raw text string for MVP
                    .eq('id', task.id);
            }
        };

        // 4. Execute LLM
        let executionResult;
        const providerLower = provider.toLowerCase();
        const agentTools: string[] = Array.isArray(agent.tools) ? agent.tools : [];
        const hasTools = agentTools.length > 0;

        // Fetch custom tools from Supabase if any custom:* tools are configured
        let customToolConfigs: CustomToolConfig[] = [];
        const hasCustomTools = agentTools.some(t => t.startsWith('custom:'));
        if (hasCustomTools) {
            const customToolIds = agentTools
                .filter(t => t.startsWith('custom:'))
                .map(t => t.replace('custom:', ''));
            const ctResult = await supabase
                .from('custom_tools')
                .select('*')
                .in('id', customToolIds);
            if (ctResult.data) {
                customToolConfigs = ctResult.data as CustomToolConfig[];
            }
            console.log(`[TaskRunner] Loaded ${customToolConfigs.length.toString()} custom tools`);
        }

        // Fetch MCP server configs and discover tools if any mcp: tools are enabled
        let mcpToolDefs: ToolDefinition[] = [];
        let mcpServers: McpServerConfig[] = [];
        const hasMcpTools = agentTools.some(t => t.startsWith('mcp:'));
        if (hasMcpTools) {
            try {
                const { data: mcpData } = await supabase
                    .from('mcp_servers')
                    .select('id, name, url, transport, config')
                    .eq('workspace_id', task.workspace_id)
                    .eq('is_enabled', true);

                if (mcpData && mcpData.length > 0) {
                    mcpServers = mcpData as McpServerConfig[];
                    // Discover tools from all connected MCP servers
                    for (const server of mcpServers) {
                        try {
                            const discovered = await discoverTools(server);
                            mcpToolDefs.push(...discovered.definitions);
                        } catch (err: unknown) {
                            const msg = err instanceof Error ? err.message : String(err);
                            console.warn(`[TaskRunner] Failed to discover MCP tools from "${server.name}": ${msg}`);
                        }
                    }
                    console.log(`[TaskRunner] Loaded ${mcpToolDefs.length.toString()} MCP tools from ${mcpServers.length.toString()} servers`);
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[TaskRunner] MCP server fetch failed (non-fatal): ${msg}`);
            }
        }

        // Fetch Serper API key if web_search tool is enabled
        let serperApiKey: string | undefined;
        if (agentTools.includes('web_search')) {
            const serperKeyResult = await supabase
                .from('api_keys')
                .select('*')
                .eq('workspace_id', task.workspace_id)
                .eq('provider', 'serper')
                .single();
            const serperKeyData = serperKeyResult.data as ApiKey | null;
            if (serperKeyData) {
                serperApiKey = decryptApiKey(serperKeyData.encrypted_key);
                console.log('[TaskRunner] Loaded Serper API key for web_search');
            } else {
                console.warn('[TaskRunner] web_search enabled but no Serper API key found');
            }
        }

        try {
            if (hasTools) {
                // ── Tool-Use Mode: non-streaming with tool loop ──
                console.log(`[TaskRunner] Agent has ${agentTools.length.toString()} tools enabled: ${agentTools.join(', ')}`);

                executionResult = await executeToolUseTask(
                    providerLower,
                    rawKey,
                    effectiveModel,
                    systemPrompt,
                    userPrompt,
                    agentTools,
                    updateResultStream,
                    customToolConfigs,
                    agent.max_tokens,
                    serperApiKey,
                    mcpToolDefs,
                    mcpServers,
                    agentTools.includes('knowledge_search')
                        ? { workspaceId: task.workspace_id, documentIds: (agent.config?.knowledge_base_ids as string[] | undefined) ?? undefined }
                        : undefined,
                    task.id,
                    apiKeyData.base_url,
                );
            } else if (providerLower === 'anthropic') {
                executionResult = await executeAnthropic(rawKey, effectiveModel, systemPrompt, userPrompt, updateResultStream, agent.max_tokens);
            } else if (providerLower === 'openai') {
                executionResult = await executeOpenAI(rawKey, effectiveModel, systemPrompt, userPrompt, updateResultStream, undefined, agent.max_tokens);
            } else if (providerLower === 'google') {
                executionResult = await executeGoogle(rawKey, effectiveModel, systemPrompt, userPrompt, updateResultStream, agent.max_tokens);
            } else if (providerLower === 'openrouter') {
                const orModel = effectiveModel.replace(/^openrouter\//, '');
                executionResult = await executeOpenAI(rawKey, orModel, systemPrompt, userPrompt, updateResultStream, 'https://openrouter.ai/api/v1', agent.max_tokens);
            } else if (providerLower === 'groq') {
                const groqModel = effectiveModel.replace(/^groq\//, '');
                executionResult = await executeOpenAI(rawKey, groqModel, systemPrompt, userPrompt, updateResultStream, 'https://api.groq.com/openai/v1', agent.max_tokens);
            } else if (providerLower === 'mistral') {
                executionResult = await executeOpenAI(rawKey, effectiveModel, systemPrompt, userPrompt, updateResultStream, 'https://api.mistral.ai/v1', agent.max_tokens);
            } else if (providerLower === 'cohere') {
                executionResult = await executeOpenAI(rawKey, effectiveModel, systemPrompt, userPrompt, updateResultStream, 'https://api.cohere.com/compatibility/v1', agent.max_tokens);
            } else if (providerLower === 'together') {
                executionResult = await executeOpenAI(rawKey, effectiveModel, systemPrompt, userPrompt, updateResultStream, 'https://api.together.xyz/v1', agent.max_tokens);
            } else if (providerLower === 'nvidia') {
                executionResult = await executeOpenAI(rawKey, effectiveModel, systemPrompt, userPrompt, updateResultStream, 'https://integrate.api.nvidia.com/v1', agent.max_tokens);
            } else if (providerLower === 'huggingface') {
                executionResult = await executeOpenAI(rawKey, effectiveModel, systemPrompt, userPrompt, updateResultStream, 'https://api-inference.huggingface.co/v1', agent.max_tokens);
            } else if (providerLower === 'venice') {
                executionResult = await executeOpenAI(rawKey, effectiveModel, systemPrompt, userPrompt, updateResultStream, 'https://api.venice.ai/api/v1', agent.max_tokens);
            } else if (providerLower === 'minimax') {
                executionResult = await executeOpenAI(rawKey, effectiveModel, systemPrompt, userPrompt, updateResultStream, 'https://api.minimaxi.chat/v1', agent.max_tokens);
            } else if (providerLower === 'moonshot') {
                executionResult = await executeOpenAI(rawKey, effectiveModel, systemPrompt, userPrompt, updateResultStream, 'https://api.moonshot.cn/v1', agent.max_tokens);
            } else if (providerLower === 'perplexity') {
                executionResult = await executeOpenAI(rawKey, effectiveModel, systemPrompt, userPrompt, updateResultStream, 'https://api.perplexity.ai', agent.max_tokens);
            } else if (providerLower === 'ollama') {
                const ollamaUrl = apiKeyData.base_url
                    ? `${apiKeyData.base_url.replace(/\/+$/, '')}/v1`
                    : 'http://localhost:11434/v1';
                executionResult = await executeOpenAI(rawKey, effectiveModel, systemPrompt, userPrompt, updateResultStream, ollamaUrl, agent.max_tokens);
            } else {
                throw new Error(`Execution for provider "${provider}" is not yet supported in the standalone runner.`);
            }
        } catch (llmError: unknown) {
            // Surface user-friendly message for invalid model IDs (400/404 from API)
            const msg = llmError instanceof Error ? llmError.message : String(llmError);
            const isModelError = msg.includes('400') || msg.includes('404') || msg.includes('not a valid model') || msg.includes('model_not_found');

            if (isModelError && agent.fallback_model) {
                // ── Fallback Model Retry ──
                console.warn(`[TaskRunner] Primary model "${effectiveModel}" failed, retrying with fallback "${agent.fallback_model}"...`);

                const fallbackProvider = inferProvider(agent.fallback_model) ?? agent.provider;
                if (!fallbackProvider) {
                    throw new Error(`Cannot determine provider for fallback model "${agent.fallback_model}".`);
                }

                // Fetch API key for fallback provider (may be same or different)
                const fbProviderLower = fallbackProvider.toLowerCase();
                let fbRawKey = rawKey; // reuse if same provider
                if (fbProviderLower !== providerLower) {
                    const fbKeyResponse = await supabase
                        .from('api_keys')
                        .select('*')
                        .eq('workspace_id', task.workspace_id)
                        .eq('provider', fbProviderLower)
                        .single();
                    const fbKeyData = fbKeyResponse.data as ApiKey | null;
                    if (fbKeyResponse.error || !fbKeyData) {
                        throw new Error(`Fallback model "${agent.fallback_model}" requires a "${fallbackProvider}" API key. Please configure it in Settings.`);
                    }
                    fbRawKey = decryptApiKey(fbKeyData.encrypted_key);
                }

                // Execute with fallback model (non-streaming, no tool loop for simplicity)
                if (fbProviderLower === 'anthropic') {
                    executionResult = await executeAnthropic(fbRawKey, agent.fallback_model, systemPrompt, userPrompt, updateResultStream, agent.max_tokens);
                } else if (fbProviderLower === 'google') {
                    executionResult = await executeGoogle(fbRawKey, agent.fallback_model, systemPrompt, userPrompt, updateResultStream, agent.max_tokens);
                } else {
                    // OpenAI-compatible providers
                    let baseUrl: string | undefined;
                    if (fbProviderLower === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1';
                    else if (fbProviderLower === 'groq') baseUrl = 'https://api.groq.com/openai/v1';
                    else if (fbProviderLower === 'mistral') baseUrl = 'https://api.mistral.ai/v1';
                    else if (fbProviderLower === 'cohere') baseUrl = 'https://api.cohere.com/compatibility/v1';
                    else if (fbProviderLower === 'together') baseUrl = 'https://api.together.xyz/v1';
                    const fbModelId = agent.fallback_model.replace(/^(openrouter|groq)\//, '');
                    executionResult = await executeOpenAI(fbRawKey, fbModelId, systemPrompt, userPrompt, updateResultStream, baseUrl, agent.max_tokens);
                }

                console.log(`[TaskRunner] Fallback model "${agent.fallback_model}" succeeded for task ${task.id}`);
            } else if (isModelError) {
                throw new Error(`Model "${effectiveModel}" is not available on ${provider}. Please update the agent's model in Settings → Agents.`);
            } else {
                throw llmError;
            }
        }

        // 4b. Apply output template if configured
        if (executionResult && agent.output_template_id) {
            try {
                const tplResult = await supabase
                    .from('output_templates')
                    .select('body')
                    .eq('id', agent.output_template_id)
                    .single();

                const tplData = tplResult.data as { body: string } | null;
                if (tplData?.body) {
                    const variables: Record<string, string> = {
                        task_title: task.title,
                        task_result: executionResult.result,
                        agent_name: agent.name,
                        timestamp: new Date().toISOString(),
                        tokens_used: executionResult.usage.totalTokens.toLocaleString(),
                        model: effectiveModel,
                    };
                    // Replace {{variable}} placeholders
                    const rendered = tplData.body.replace(/\{\{(\w+)\}\}/g, (_match: string, varName: string) => {
                        return varName in variables ? variables[varName] : `{{${varName}}}`;
                    });
                    executionResult = { ...executionResult, result: rendered };
                    console.log(`[TaskRunner] Applied output template ${agent.output_template_id} to task ${task.id}`);
                }
            } catch (tplErr) {
                console.warn(`[TaskRunner] Failed to apply output template (non-fatal):`, tplErr);
            }
        }

        // 5. Finalize Task success
        await supabase
            .from('tasks')
            .update({
                status: 'completed',
                result: executionResult.result,
                metadata: {
                    usage: executionResult.usage,
                    tool_calls: (executionResult as { toolCallLogs?: ToolCallLog[] }).toolCallLogs ?? [],
                },
            })
            .eq('id', task.id);

        // 6. Finalize agent_task success
        if (agentTaskId) {
            await supabase
                .from('agent_tasks')
                .update({
                    status: 'completed',
                    result: { output: executionResult.result },
                    model_used: effectiveModel,
                    tokens_used: executionResult.usage.totalTokens,
                    cost_estimate_usd: executionResult.usage.costEstimateUSD,
                    completed_at: new Date().toISOString(),
                })
                .eq('id', agentTaskId);
        }

        // 7. Write usage record
        await writeTaskUsageRecord({
            workspaceId: task.workspace_id,
            taskId: task.id,
            agentId: agent.id,
            provider: provider,
            model: effectiveModel,
            tokensUsed: executionResult.usage.totalTokens,
            promptTokens: executionResult.usage.promptTokens,
            completionTokens: executionResult.usage.completionTokens,
            costEstimateUsd: executionResult.usage.costEstimateUSD,
        });

        console.log(`[TaskRunner] Completed task ${task.id} successfully.`);

        // 7a. Mark agent as idle
        await supabase
            .from('agents')
            .update({ status: 'idle' })
            .eq('id', agent.id);

        // 7b. Extract output file artifacts (fire-and-forget)
        void extractAndSaveArtifacts(task.workspace_id, task.id, null, executionResult.result);

        // 7c. Disconnect MCP clients (fire-and-forget)
        if (mcpServers.length > 0) void disconnectMcpClients();

        // 8. Fire webhooks (fire-and-forget)
        void dispatchWebhooks(
            { id: task.id, title: task.title, workspace_id: task.workspace_id, status: 'completed', result: executionResult.result },
            { id: agent.id, name: agent.name },
            'task.completed',
            agent.output_route_ids ?? null,
        );

        // AG-UI: Run finished
        agUiEventBus.emit(task.id, {
            type: AgUiEventType.RUN_FINISHED,
            timestamp: Date.now(),
            threadId: task.id,
            runId: task.id,
            result: executionResult.result,
        });

        // 8b. Reply to source channel if task originated from messaging (fire-and-forget)
        void replyToSourceChannel(task.id, executionResult.result, null, 'completed');

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[TaskRunner] Failed task ${task.id}:`, errMsg);

        // Finalize Task failure
        await supabase
            .from('tasks')
            .update({
                status: 'failed',
                error: errMsg,
            })
            .eq('id', task.id);

        // Finalize agent_task failure
        if (agentTaskId) {
            await supabase
                .from('agent_tasks')
                .update({
                    status: 'failed',
                    error_message: errMsg,
                    completed_at: new Date().toISOString(),
                })
                .eq('id', agentTaskId);
        }

        // Mark agent as idle after failure
        if (agent) {
            await supabase
                .from('agents')
                .update({ status: 'idle' })
                .eq('id', agent.id);
        }

        // Fire webhooks for failure (fire-and-forget)
        void dispatchWebhooks(
            { id: task.id, title: task.title, workspace_id: task.workspace_id, status: 'failed', error: errMsg },
            { id: agent?.id, name: agent?.name ?? 'Unknown Agent' },
            'task.failed',
            agent?.output_route_ids ?? null,
        );

        // Reply to source channel on failure too
        void replyToSourceChannel(task.id, null, errMsg, 'failed');

        // AG-UI: Run error
        agUiEventBus.emit(task.id, {
            type: AgUiEventType.RUN_ERROR,
            timestamp: Date.now(),
            threadId: task.id,
            runId: task.id,
            message: errMsg,
            code: 'TASK_FAILED',
        });
    }
}

// ─── Tool-Use Task Executor ─────────────────────────────────────────────────────────────────

import OpenAI from 'openai';

/**
 * Execute a task using the tool-use loop.
 * Uses non-streaming OpenAI-compatible calls to support tool_calls.
 */
async function executeToolUseTask(
    providerLower: string,
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string,
    toolNames: string[],
    onProgressUpdate: (text: string) => Promise<void>,
    customTools?: CustomToolConfig[],
    maxTokens?: number | null,
    serperApiKey?: string,
    mcpToolDefs?: ToolDefinition[],
    mcpServers?: McpServerConfig[],
    knowledgeContext?: { workspaceId: string; documentIds?: string[] },
    taskId?: string,
    customBaseUrl?: string | null,
): Promise<{ result: string; usage: TokenUsage; toolCallLogs: ToolCallLog[] }> {
    // Determine base URL for OpenAI-compatible providers
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
        ollama: 'http://localhost:11434/v1',
    };

    // Use custom base_url from the API key record if available (e.g. non-localhost Ollama)
    if (customBaseUrl) {
        const cleanUrl = customBaseUrl.replace(/\/+$/, '');
        baseURLMap[providerLower] = cleanUrl.endsWith('/v1') ? cleanUrl : `${cleanUrl}/v1`;
    }

    // For tool-use, we use the OpenAI SDK for all providers (they're all OpenAI-compatible)
    const baseURL = baseURLMap[providerLower];
    let effectiveModel = model;

    // Strip provider prefix for routed providers
    if (providerLower === 'openrouter') {
        effectiveModel = model.replace(/^openrouter\//, '');
    } else if (providerLower === 'groq') {
        effectiveModel = model.replace(/^groq\//, '');
    }

    const openai = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    const tools = getToolDefinitions(toolNames, customTools);

    const toolLoopResult = await executeWithToolLoop(
        async (messages, toolDefs) => {
            // Build properly-typed OpenAI messages
            const openaiMessages: OpenAI.ChatCompletionMessageParam[] = messages.map(m => {
                if (m.role === 'system') {
                    return { role: 'system' as const, content: m.content ?? '' };
                }
                if (m.role === 'user') {
                    return { role: 'user' as const, content: m.content ?? '' };
                }
                if (m.role === 'tool') {
                    return { role: 'tool' as const, content: m.content ?? '', tool_call_id: m.tool_call_id ?? '' };
                }
                // assistant
                const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
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
                ...(maxTokens != null ? { max_tokens: maxTokens } : {}),
            });

            const choice = response.choices[0];
            const assistantMsg = choice?.message;

            // Update progress with current content
            if (assistantMsg?.content) {
                await onProgressUpdate(assistantMsg.content);
            }

            // Extract tool_calls — handle both SDK shapes
            const toolCalls = assistantMsg?.tool_calls?.map(tc => ({
                id: tc.id,
                function: {
                    name: (tc as { function: { name: string; arguments: string } }).function.name,
                    arguments: (tc as { function: { name: string; arguments: string } }).function.arguments,
                },
            }));

            return {
                message: {
                    role: 'assistant' as const,
                    content: assistantMsg?.content ?? null,
                    tool_calls: toolCalls,
                },
                usage: {
                    promptTokens: response.usage?.prompt_tokens ?? 0,
                    completionTokens: response.usage?.completion_tokens ?? 0,
                },
            };
        },
        systemPrompt,
        userPrompt,
        toolNames,
        customTools,
        serperApiKey,
        mcpToolDefs,
        mcpServers,
        knowledgeContext,
        taskId,
    );

    void tools; // definitions are used internally by the loop

    console.log(`[TaskRunner] Tool-use complete. ${toolLoopResult.toolCallsMade.toString()} tool calls made.`);

    return {
        result: toolLoopResult.result,
        usage: toolLoopResult.usage,
        toolCallLogs: toolLoopResult.toolCallLogs,
    };
}
