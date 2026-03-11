// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// Shared LLM execution helper — used by both pipeline and orchestrator executors.

import { supabase } from './supabase';
import { executeAnthropic } from './providers/anthropic';
import { executeOpenAI } from './providers/openai';
import { executeGoogle } from './providers/google';
import { decryptApiKey } from './crypto';
import type { Agent, ApiKey, TokenUsage } from './types';

export interface LLMCallInput {
    workspaceId: string;
    agentId: string;
    systemPrompt: string;
    userPrompt: string;
    onStream?: (text: string) => Promise<void> | void;
}

export interface LLMCallResult {
    result: string;
    usage: TokenUsage;
    provider: string;
    model: string;
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

    // 3. Route to provider with retry logic
    const provider = agent.provider.toLowerCase();
    const rawStreamFn = input.onStream;
    const streamFn = async (text: string): Promise<void> => {
        if (rawStreamFn) await rawStreamFn(text);
    };

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
