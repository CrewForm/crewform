// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// Shared LLM execution helper — used by both pipeline and orchestrator executors.

import { supabase } from './supabase';
import { executeAnthropic } from './providers/anthropic';
import { executeOpenAI } from './providers/openai';
import { executeGoogle } from './providers/google';
import { decryptApiKey } from './crypto';
import { executeWithToolLoop, getToolDefinitions } from './toolExecutor';
import type { CustomToolConfig, ToolCallLog } from './toolExecutor';
import type { Agent, ApiKey, TokenUsage } from './types';

export interface LLMCallInput {
    workspaceId: string;
    agentId: string;
    systemPrompt: string;
    userPrompt: string;
    onStream?: (text: string) => Promise<void> | void;
    /** When true, checks if the agent has tools and uses tool-use loop */
    enableTools?: boolean;
}

export interface LLMCallResult {
    result: string;
    usage: TokenUsage;
    provider: string;
    model: string;
    toolCallLogs: ToolCallLog[];
}

// ─── Retry Configuration ─────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s exponential backoff

/** Patterns that indicate a transient/retryable error */
const RETRYABLE_PATTERNS = [
    'SSE stream',          // Google/OpenRouter SSE streaming errors
    'rate limit',          // Rate limiting
    'rate_limit',
    '429',                 // Too Many Requests
    '500',                 // Internal Server Error
    '502',                 // Bad Gateway
    '503',                 // Service Unavailable
    '504',                 // Gateway Timeout
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'socket hang up',
    'network',
    'overloaded',
    'capacity',
    'timeout',
];

function isRetryableError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();
    return RETRYABLE_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an LLM call for a given agent, handling key decryption and provider routing.
 * Shared between pipeline steps and orchestrator delegations.
 * Includes retry logic with exponential backoff for transient errors.
 */
export async function executeLLMCall(input: LLMCallInput): Promise<LLMCallResult> {
    // 1. Fetch agent
    const agentResponse = await supabase
        .from('agents')
        .select('*')
        .eq('id', input.agentId)
        .single();

    const agent = agentResponse.data as Agent | null;
    if (agentResponse.error || !agent) {
        throw new Error(`Failed to load agent ${input.agentId}: ${agentResponse.error?.message ?? 'not found'}`);
    }

    // 2. Fetch API key
    const keyResponse = await supabase
        .from('api_keys')
        .select('*')
        .eq('workspace_id', input.workspaceId)
        .eq('provider', agent.provider)
        .single();

    const apiKeyData = keyResponse.data as ApiKey | null;
    if (keyResponse.error || !apiKeyData) {
        throw new Error(`No API key for provider ${agent.provider}. Configure it in Settings.`);
    }

    const rawKey = decryptApiKey(apiKeyData.encrypted_key);

    // Provider routing common to both tool-use and direct modes
    const provider = agent.provider.toLowerCase();

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

    let effectiveModel = agent.model;
    if (provider === 'openrouter') {
        effectiveModel = agent.model.replace(/^openrouter\//, '');
    } else if (provider === 'groq') {
        effectiveModel = agent.model.replace(/^groq\//, '');
    }

    // 3. Check if tool-use mode is requested and agent has tools
    const agentTools: string[] = Array.isArray(agent.tools) ? agent.tools : [];
    const useToolLoop = input.enableTools === true && agentTools.length > 0;

    if (useToolLoop) {
        // ── Tool-Use Mode ──
        console.log(`[LLMHelper] Agent ${agent.name} has ${agentTools.length} tools: ${agentTools.join(', ')}`);

        // Fetch Serper API key if web_search is enabled
        let serperApiKey: string | undefined;
        if (agentTools.includes('web_search')) {
            const serperKeyResult = await supabase
                .from('api_keys')
                .select('*')
                .eq('workspace_id', input.workspaceId)
                .eq('provider', 'serper')
                .single();
            const serperKeyData = serperKeyResult.data as ApiKey | null;
            if (serperKeyData) {
                serperApiKey = decryptApiKey(serperKeyData.encrypted_key);
            } else {
                console.warn('[LLMHelper] web_search enabled but no Serper API key found');
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

        // Use OpenAI SDK for tool-use loop
        const OpenAI = (await import('openai')).default;
        const baseURL = baseURLMap[provider];
        const openai = new OpenAI({ apiKey: rawKey, ...(baseURL ? { baseURL } : {}) });
        void getToolDefinitions(agentTools, customToolConfigs); // validate

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
            input.systemPrompt,
            input.userPrompt,
            agentTools,
            customToolConfigs,
            serperApiKey,
        );

        console.log(`[LLMHelper] Tool-use complete. ${toolLoopResult.toolCallsMade} tool calls made.`);

        return {
            result: toolLoopResult.result,
            usage: toolLoopResult.usage,
            provider: agent.provider,
            model: agent.model,
            toolCallLogs: toolLoopResult.toolCallLogs,
        };
    }

    // 4. Route to provider with retry logic (no tools)
    const rawStreamFn = input.onStream;
    const streamFn = async (text: string): Promise<void> => {
        if (rawStreamFn) await rawStreamFn(text);
    };

    // ─── Retry Loop ──────────────────────────────────────────────────────────
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            let executionResult: { result: string; usage: TokenUsage };

            if (provider === 'anthropic') {
                executionResult = await executeAnthropic(rawKey, effectiveModel, input.systemPrompt, input.userPrompt, streamFn);
            } else if (provider === 'google') {
                executionResult = await executeGoogle(rawKey, effectiveModel, input.systemPrompt, input.userPrompt, streamFn);
            } else if (provider === 'openai' || baseURLMap[provider]) {
                const baseURL = baseURLMap[provider];
                executionResult = await executeOpenAI(rawKey, effectiveModel, input.systemPrompt, input.userPrompt, streamFn, baseURL);
            } else {
                throw new Error(`Provider "${provider}" is not yet supported.`);
            }

            return {
                result: executionResult.result,
                usage: executionResult.usage,
                provider: agent.provider,
                model: agent.model,
                toolCallLogs: [],
            };
        } catch (err: unknown) {
            lastError = err;
            const errMsg = err instanceof Error ? err.message : String(err);

            if (attempt < MAX_RETRIES && isRetryableError(err)) {
                const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 1s, 2s, 4s
                console.warn(
                    `[LLMHelper] Attempt ${attempt}/${MAX_RETRIES} failed (${errMsg}). Retrying in ${delayMs}ms...`,
                );
                await sleep(delayMs);
            } else {
                // Non-retryable error or final attempt — throw immediately
                throw err;
            }
        }
    }

    // Should not reach here, but safety net
    throw lastError;
}
