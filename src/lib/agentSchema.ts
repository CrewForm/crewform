// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { z } from 'zod'

/**
 * Built-in tools available for agents.
 * Each tool has a name (used as the ID), label, description, and icon.
 */
export const BUILT_IN_TOOLS = [
    {
        name: 'web_search',
        label: 'Web Search',
        description: 'Search the web using Google via Serper. Requires a Serper API key.',
        icon: '🔍',
        requiresProvider: 'serper' as const,
    },
    {
        name: 'http_request',
        label: 'HTTP Request',
        description: 'Make HTTP requests to external APIs and URLs.',
        icon: '🌐',
        requiresProvider: undefined,
    },
    {
        name: 'code_interpreter',
        label: 'Code Interpreter',
        description: 'Execute JavaScript code in a sandboxed environment.',
        icon: '💻',
        requiresProvider: undefined,
    },
    {
        name: 'read_file',
        label: 'Read File',
        description: 'Read contents of a file from a provided URL.',
        icon: '📄',
        requiresProvider: undefined,
    },
    {
        name: 'grammar_check',
        label: 'Grammar Check',
        description: 'Check text for grammar, spelling, and style issues using LanguageTool.',
        icon: '✏️',
        requiresProvider: undefined,
    },
] as const

export type BuiltInToolName = typeof BUILT_IN_TOOLS[number]['name']

/**
 * Zod schema for agent creation / editing.
 * Validates all fields before Supabase insert.
 */
export const agentSchema = z.object({
    name: z
        .string()
        .min(1, 'Name is required')
        .max(100, 'Name must be 100 characters or less')
        .trim(),
    description: z
        .string()
        .max(500, 'Description must be 500 characters or less')
        .default(''),
    model: z
        .string()
        .min(1, 'Model is required'),
    system_prompt: z
        .string()
        .max(10000, 'System prompt must be 10,000 characters or less')
        .default(''),
    temperature: z
        .number()
        .min(0, 'Temperature must be 0 or higher')
        .max(2, 'Temperature must be 2 or lower')
        .default(0.7),
    max_tokens: z
        .number()
        .int('Max tokens must be a whole number')
        .min(1, 'Max tokens must be at least 1')
        .nullable()
        .default(null),
    tags: z
        .array(z.string().max(50, 'Each tag must be 50 characters or less'))
        .max(20, 'Maximum 20 tags')
        .default([]),
    tools: z
        .array(z.string())
        .default([]),
    fallback_model: z
        .string()
        .nullable()
        .default(null),
})

export type AgentFormData = z.infer<typeof agentSchema>

/**
 * Validates agent form data and returns either parsed data or field errors.
 */
export function validateAgentForm(data: unknown): {
    success: boolean
    data?: AgentFormData
    errors?: Record<string, string>
} {
    const result = agentSchema.safeParse(data)

    if (result.success) {
        return { success: true, data: result.data }
    }

    const errors: Record<string, string> = {}
    for (const issue of result.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string') {
            errors[field] = issue.message
        }
    }
    return { success: false, errors }
}

/** Available models grouped by provider */
export const MODEL_OPTIONS = [
    {
        provider: 'Anthropic',
        models: [
            { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
            { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5' },
            { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1' },
            { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
            { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
            { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
            { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
            { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
            { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
        ],
    },
    {
        provider: 'OpenAI',
        models: [
            { value: 'o3', label: 'o3' },
            { value: 'o3-mini', label: 'o3 Mini' },
            { value: 'o1', label: 'o1' },
            { value: 'o1-mini', label: 'o1 Mini' },
            { value: 'gpt-4.1', label: 'GPT-4.1' },
            { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
            { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
            { value: 'gpt-4o', label: 'GPT-4o' },
            { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
        ],
    },
    {
        provider: 'Google',
        models: [
            { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
            { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
            { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)' },
            { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
            { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
            { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
            { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
        ],
    },
    {
        provider: 'OpenRouter',
        models: [] as { value: string; label: string }[], // Populated dynamically
    },
    {
        provider: 'Mistral',
        models: [
            { value: 'mistral-large-latest', label: 'Mistral Large 3' },
            { value: 'mistral-medium-latest', label: 'Mistral Medium 3.1' },
            { value: 'mistral-small-latest', label: 'Mistral Small 3.2' },
            { value: 'ministral-3-14b-latest', label: 'Ministral 3 14B' },
            { value: 'ministral-3-8b-latest', label: 'Ministral 3 8B' },
            { value: 'magistral-medium-latest', label: 'Magistral Medium' },
            { value: 'magistral-small-latest', label: 'Magistral Small' },
            { value: 'codestral-latest', label: 'Codestral' },
            { value: 'devstral-2-latest', label: 'Devstral 2' },
        ],
    },
    {
        provider: 'Groq',
        models: [
            { value: 'groq/llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
            { value: 'groq/llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
            { value: 'groq/openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
            { value: 'groq/openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
            { value: 'groq/meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B' },
            { value: 'groq/qwen/qwen3-32b', label: 'Qwen3 32B' },
        ],
    },
    {
        provider: 'Cohere',
        models: [
            { value: 'command-a-03-2025', label: 'Command A' },
            { value: 'command-a-reasoning-08-2025', label: 'Command A Reasoning' },
            { value: 'command-r-plus-08-2024', label: 'Command R+ (08-2024)' },
            { value: 'command-r-08-2024', label: 'Command R (08-2024)' },
            { value: 'command-r7b-12-2024', label: 'Command R 7B' },
        ],
    },
    {
        provider: 'Together',
        models: [
            { value: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', label: 'Llama 4 Maverick 17B' },
            { value: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', label: 'Llama 4 Scout 17B' },
            { value: 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo' },
            { value: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', label: 'Llama 3.1 405B Turbo' },
            { value: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', label: 'Llama 3.1 70B Turbo' },
            { value: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', label: 'Llama 3.1 8B Turbo' },
            { value: 'Qwen/Qwen3-235B-A22B-fp8', label: 'Qwen3 235B' },
            { value: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B Turbo' },
            { value: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1' },
            { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
            { value: 'google/gemma-2-27b-it', label: 'Gemma 2 27B' },
            { value: 'mistralai/Mixtral-8x22B-Instruct-v0.1', label: 'Mixtral 8x22B' },
        ],
    },
    {
        provider: 'NVIDIA',
        models: [
            { value: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'Nemotron 70B' },
            { value: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
            { value: 'meta/llama-3.1-405b-instruct', label: 'Llama 3.1 405B' },
            { value: 'meta/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' },
            { value: 'meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B' },
            { value: 'mistralai/mistral-large-2-instruct', label: 'Mistral Large 2' },
            { value: 'google/gemma-2-27b-it', label: 'Gemma 2 27B' },
            { value: 'deepseek-ai/deepseek-r1', label: 'DeepSeek R1' },
        ],
    },
    {
        provider: 'Hugging Face',
        models: [
            { value: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B' },
            { value: 'meta-llama/Llama-3.1-70B-Instruct', label: 'Llama 3.1 70B' },
            { value: 'meta-llama/Llama-3.1-8B-Instruct', label: 'Llama 3.1 8B' },
            { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B' },
            { value: 'Qwen/Qwen2.5-Coder-32B-Instruct', label: 'Qwen 2.5 Coder 32B' },
            { value: 'mistralai/Mistral-7B-Instruct-v0.3', label: 'Mistral 7B v0.3' },
            { value: 'google/gemma-2-27b-it', label: 'Gemma 2 27B' },
            { value: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1' },
        ],
    },
    {
        provider: 'Venice',
        models: [
            { value: 'deepseek-r1-671b', label: 'DeepSeek R1 671B' },
            { value: 'deepseek-v3-0324', label: 'DeepSeek V3' },
            { value: 'llama-3.3-70b', label: 'Llama 3.3 70B' },
            { value: 'llama-3.1-405b', label: 'Llama 3.1 405B' },
            { value: 'qwen-2.5-coder-32b', label: 'Qwen 2.5 Coder 32B' },
        ],
    },
    {
        provider: 'MiniMax',
        models: [
            { value: 'MiniMax-M2.5', label: 'MiniMax M2.5' },
            { value: 'MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 Highspeed' },
            { value: 'MiniMax-M2.1', label: 'MiniMax M2.1' },
            { value: 'MiniMax-M2.1-highspeed', label: 'MiniMax M2.1 Highspeed' },
            { value: 'MiniMax-M2', label: 'MiniMax M2' },
        ],
    },
    {
        provider: 'Moonshot',
        models: [
            { value: 'moonshot-v1-128k', label: 'Moonshot V1 128K' },
            { value: 'moonshot-v1-32k', label: 'Moonshot V1 32K' },
            { value: 'moonshot-v1-8k', label: 'Moonshot V1 8K' },
        ],
    },
    {
        provider: 'Perplexity',
        models: [
            { value: 'sonar-deep-research', label: 'Sonar Deep Research' },
            { value: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro' },
            { value: 'sonar-reasoning', label: 'Sonar Reasoning' },
            { value: 'sonar-pro', label: 'Sonar Pro' },
            { value: 'sonar', label: 'Sonar' },
        ],
    },
]

export type ModelGroup = typeof MODEL_OPTIONS[number]

/**
 * Filter MODEL_OPTIONS to only include providers whose ID is in the active list.
 * Provider IDs are lowercase (e.g. 'anthropic', 'openai').
 */
export function getActiveModelOptions(activeProviderIds: string[]) {
    const activeSet = new Set(activeProviderIds.map((id) => id.toLowerCase()))
    return MODEL_OPTIONS.filter((group) => activeSet.has(group.provider.toLowerCase()))
}

/**
 * Merge dynamic models into the static model options.
 * Used for providers like OpenRouter whose model list is fetched live.
 */
export function mergeModelOptions(
    staticOptions: ModelGroup[],
    dynamicModels: { provider: string; models: { value: string; label: string }[] }[],
): ModelGroup[] {
    const dynamicMap = new Map(
        dynamicModels.map((d) => [d.provider.toLowerCase(), d.models]),
    )

    return staticOptions.map((group) => {
        const dynamic = dynamicMap.get(group.provider.toLowerCase())
        if (dynamic && dynamic.length > 0) {
            return { ...group, models: dynamic }
        }
        return group
    })
}

/**
 * Derive the provider from a model name.
 * Used at save time to ensure provider and model are always in sync.
 */
export function inferProviderFromModel(model: string): string {
    const m = model.toLowerCase()
    // Prefix checks first — must take priority over keyword matches
    if (m.startsWith('openrouter/')) return 'openrouter'
    if (m.startsWith('groq/')) return 'groq'
    // Keyword matches
    if (m.includes('claude')) return 'anthropic'
    if (m.includes('gpt') || m.includes('o1') || m.includes('o3')) return 'openai'
    if (m.includes('gemini')) return 'google'
    if (m.includes('mistral') || m.includes('codestral')) return 'mistral'
    if (m.includes('command-r')) return 'cohere'
    // New providers
    if (m.includes('togethercomputer') || m.includes('together/')) return 'together'
    if (m.includes('nvidia/') || m.includes('nim/') || m.includes('nemotron')) return 'nvidia'
    if (m.includes('minimax') || m.includes('abab')) return 'minimax'
    if (m.includes('moonshot')) return 'moonshot'
    if (m.includes('venice') || m.includes('deepseek-r1')) return 'venice'
    return 'unknown'
}
