// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// providers.ts — Provider routing: model→provider inference and base URL mapping.
// Extracted from task-runner/src/executor.ts for standalone CLI use.

/**
 * Derive provider from model name when not explicitly specified.
 * Maps well-known model prefixes to their provider.
 */
export function inferProvider(model: string): string | null {
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
    if (m.includes('togethercomputer') || m.includes('together/')) return 'together';
    if (m.includes('nvidia/') || m.includes('nim/')) return 'nvidia';
    if (m.includes('minimax')) return 'minimax';
    if (m.includes('moonshot')) return 'moonshot';
    if (m.includes('sonar')) return 'perplexity';
    // If nothing matches, try Ollama (most common for local models)
    return null;
}

/**
 * Base URL map for OpenAI-compatible providers.
 * The OpenAI SDK is used for all providers except Anthropic and Google.
 */
export const BASE_URL_MAP: Record<string, string> = {
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

/**
 * Providers that use their own native SDK (not OpenAI-compatible).
 */
export const NATIVE_SDK_PROVIDERS = new Set(['anthropic', 'google']);

/**
 * Map of environment variable names for each provider's API key.
 */
export const API_KEY_ENV_MAP: Record<string, string[]> = {
    openai: ['OPENAI_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'],
    google: ['GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    groq: ['GROQ_API_KEY'],
    mistral: ['MISTRAL_API_KEY'],
    cohere: ['COHERE_API_KEY'],
    openrouter: ['OPENROUTER_API_KEY'],
    together: ['TOGETHER_API_KEY'],
    nvidia: ['NVIDIA_API_KEY'],
    huggingface: ['HUGGINGFACE_API_KEY', 'HF_TOKEN'],
    venice: ['VENICE_API_KEY'],
    minimax: ['MINIMAX_API_KEY'],
    moonshot: ['MOONSHOT_API_KEY'],
    perplexity: ['PERPLEXITY_API_KEY'],
    ollama: ['OLLAMA_API_KEY'], // Usually not needed
    serper: ['SERPER_API_KEY'],
};

/**
 * Resolve an API key for a provider from environment variables.
 * Ollama returns 'ollama' as a dummy key (no auth needed).
 */
export function resolveApiKey(provider: string): string | null {
    const lower = provider.toLowerCase();

    // Ollama doesn't require an API key
    if (lower === 'ollama') return 'ollama';

    const envVars = API_KEY_ENV_MAP[lower];
    if (!envVars) return null;

    for (const envVar of envVars) {
        const value = process.env[envVar];
        if (value) return value;
    }
    return null;
}

/**
 * Strip provider prefix from model name for routed providers.
 */
export function normaliseModelName(model: string, provider: string): string {
    const lower = provider.toLowerCase();
    if (lower === 'openrouter') return model.replace(/^openrouter\//, '');
    if (lower === 'groq') return model.replace(/^groq\//, '');
    return model;
}

/**
 * Detect if Ollama is running locally by probing the API.
 */
export async function detectOllama(baseUrl = 'http://localhost:11434'): Promise<{
    available: boolean;
    models: string[];
}> {
    try {
        const response = await fetch(`${baseUrl}/api/tags`, {
            signal: AbortSignal.timeout(2000),
        });
        if (!response.ok) return { available: false, models: [] };

        const data = await response.json() as { models?: { name: string }[] };
        const models = data.models?.map((m) => m.name) ?? [];
        return { available: true, models };
    } catch {
        return { available: false, models: [] };
    }
}
