// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// executor.ts — Local agent execution engine.
// Simplified version of task-runner/src/executor.ts — no Supabase dependency.

import OpenAI from 'openai';
import chalk from 'chalk';
import { executeAnthropic } from './providers/anthropic.js';
import { executeOpenAI } from './providers/openai.js';
import { executeGoogle } from './providers/google.js';
import { inferProvider, resolveApiKey, normaliseModelName, BASE_URL_MAP, NATIVE_SDK_PROVIDERS } from './providers.js';
import { executeWithToolLoop, getToolDefinitions } from './tools.js';
import type { ToolDefinition } from './tools.js';
import type { AgentConfig } from './config.js';
import type { TokenUsage, ExecutionResult } from './types.js';
import type { McpServerConfig } from './mcpClient.js';

// ─── Streaming callback type ────────────────────────────────────────────────

export type OnStreamChunk = (delta: string, fullText: string) => void;

// ─── Execute Agent ───────────────────────────────────────────────────────────

export interface ExecuteOptions {
    /** Override the prompt (used by chat mode to pass full conversation) */
    prompt: string;
    /** Stream each text chunk to a callback */
    onStream?: OnStreamChunk;
    /** Callback when a tool is called */
    onToolCall?: (name: string, args: Record<string, unknown>) => void;
    /** Override the provider's API key */
    apiKey?: string;
    /** Override the Ollama base URL */
    ollamaBaseUrl?: string;
    /** MCP server configurations to connect to */
    mcpServers?: McpServerConfig[];
}

/**
 * Execute a single agent with the given prompt.
 * Handles provider routing, API key resolution, tool-use, and streaming.
 */
export async function executeAgent(
    agent: AgentConfig,
    options: ExecuteOptions,
): Promise<ExecutionResult> {
    // 1. Resolve provider
    const provider = (agent.provider ?? inferProvider(agent.model) ?? 'ollama').toLowerCase();

    // 2. Resolve API key
    const apiKey = options.apiKey ?? resolveApiKey(provider);
    if (!apiKey) {
        const envHint = provider === 'openai' ? 'OPENAI_API_KEY'
            : provider === 'anthropic' ? 'ANTHROPIC_API_KEY'
            : provider === 'google' ? 'GOOGLE_API_KEY'
            : `${provider.toUpperCase()}_API_KEY`;
        throw new Error(
            `No API key found for provider "${provider}". ` +
            `Set the ${envHint} environment variable or add it to .env`,
        );
    }

    // 3. Build system prompt with voice profile
    let systemPrompt = agent.system_prompt || 'You are a helpful AI assistant.';
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

    const userPrompt = options.prompt;

    // 4. Stream handler — bridges provider's accumulated text to our delta-based callback
    let lastStreamLength = 0;
    const onChunk = async (fullText: string): Promise<void> => {
        if (options.onStream && fullText.length > lastStreamLength) {
            const delta = fullText.slice(lastStreamLength);
            lastStreamLength = fullText.length;
            options.onStream(delta, fullText);
        }
    };

    // 5. Check for tools
    const allToolNames = agent.tools ?? [];
    const toolNames = allToolNames.filter(t =>
        // Support built-in tools and MCP tools in CLI mode
        !t.startsWith('custom:') &&
        t !== 'knowledge_search' && t !== 'a2a_delegate',
    );
    const hasMcpTools = allToolNames.some(t => t.startsWith('mcp:'));

    // Discover MCP tools if configured
    let mcpToolDefs: ToolDefinition[] = [];
    const mcpServers = options.mcpServers;
    if ((hasMcpTools || (mcpServers && mcpServers.length > 0)) && mcpServers) {
        const { discoverTools: discoverMcpTools } = await import('./mcpClient.js');
        for (const server of mcpServers) {
            try {
                const discovered = await discoverMcpTools(server);
                mcpToolDefs.push(...discovered.definitions);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                // Non-fatal — log and continue
                console.error(chalk.dim(`  ⚠ MCP ${server.name}: ${msg}`));
            }
        }
    }

    const hasTools = toolNames.filter(t => !t.startsWith('mcp:')).length > 0 || mcpToolDefs.length > 0;

    // Resolve Serper API key for web_search
    const serperApiKey = toolNames.includes('web_search')
        ? resolveApiKey('serper') ?? undefined
        : undefined;

    // 6. Execute
    let result: ExecutionResult;

    try {
        if (hasTools) {
            // Tool-use mode (non-streaming, uses OpenAI SDK for all providers)
            result = await executeWithTools(
                provider, apiKey, agent.model, systemPrompt, userPrompt,
                toolNames, onChunk, agent.max_tokens, serperApiKey,
                options.onToolCall, options.ollamaBaseUrl,
                mcpToolDefs, mcpServers,
            );
        } else {

    // Direct streaming mode
    const effectiveModel = normaliseModelName(agent.model, provider);

    let directResult: { result: string; usage: TokenUsage };

    if (provider === 'anthropic') {
        directResult = await executeAnthropic(apiKey, effectiveModel, systemPrompt, userPrompt, onChunk, agent.max_tokens);
    } else if (provider === 'google') {
        directResult = await executeGoogle(apiKey, effectiveModel, systemPrompt, userPrompt, onChunk, agent.max_tokens);
    } else {
        // OpenAI-compatible (all other providers)
        let baseURL = BASE_URL_MAP[provider];
        if (provider === 'ollama' && options.ollamaBaseUrl) {
            const cleanUrl = options.ollamaBaseUrl.replace(/\/+$/, '');
            baseURL = cleanUrl.endsWith('/v1') ? cleanUrl : `${cleanUrl}/v1`;
        }
        directResult = await executeOpenAI(apiKey, effectiveModel, systemPrompt, userPrompt, onChunk, baseURL, agent.max_tokens);
    }

    result = { ...directResult, toolCallLogs: [] };
        }
    } finally {
        // Disconnect MCP servers
        if (mcpServers && mcpServers.length > 0) {
            const { disconnectAll } = await import('./mcpClient.js');
            await disconnectAll();
        }
    }

    return result;
}

// ─── Tool-Use Execution ─────────────────────────────────────────────────────

async function executeWithTools(
    provider: string,
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string,
    toolNames: string[],
    onProgressUpdate: (text: string) => Promise<void>,
    maxTokens?: number | null,
    serperApiKey?: string,
    onToolCall?: (name: string, args: Record<string, unknown>) => void,
    ollamaBaseUrl?: string,
    mcpToolDefs?: ToolDefinition[],
    mcpServers?: McpServerConfig[],
): Promise<ExecutionResult> {
    let baseURL = BASE_URL_MAP[provider];
    if (provider === 'ollama' && ollamaBaseUrl) {
        const cleanUrl = ollamaBaseUrl.replace(/\/+$/, '');
        baseURL = cleanUrl.endsWith('/v1') ? cleanUrl : `${cleanUrl}/v1`;
    }

    const effectiveModel = normaliseModelName(model, provider);
    const openai = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });

    const toolLoopResult = await executeWithToolLoop(
        async (messages, toolDefs) => {
            const openaiMessages: OpenAI.ChatCompletionMessageParam[] = messages.map(m => {
                if (m.role === 'system') return { role: 'system' as const, content: m.content ?? '' };
                if (m.role === 'user') return { role: 'user' as const, content: m.content ?? '' };
                if (m.role === 'tool') return { role: 'tool' as const, content: m.content ?? '', tool_call_id: m.tool_call_id ?? '' };
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
            const msg = choice?.message;

            if (msg?.content) {
                await onProgressUpdate(msg.content);
            }

            const toolCalls = msg?.tool_calls?.map(tc => ({
                id: tc.id,
                function: {
                    name: (tc as { function: { name: string; arguments: string } }).function.name,
                    arguments: (tc as { function: { name: string; arguments: string } }).function.arguments,
                },
            }));

            return {
                message: {
                    role: 'assistant' as const,
                    content: msg?.content ?? null,
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
        serperApiKey,
        onToolCall,
        mcpToolDefs,
        mcpServers,
    );

    return {
        result: toolLoopResult.result,
        usage: toolLoopResult.usage,
        toolCallLogs: toolLoopResult.toolCallLogs,
    };
}
