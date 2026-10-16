// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'

interface OpenRouterModel {
    id: string
    name: string
    context_length?: number
    pricing?: {
        prompt: string
        completion: string
    }
}

interface ModelOption {
    value: string
    label: string
}

/**
 * Popular OpenRouter models as fallback when the live API is unavailable.
 */
const FALLBACK_MODELS: ModelOption[] = [
    { value: 'openrouter/deepseek/deepseek-chat-v3-0324', label: 'DeepSeek V3 (0324)' },
    { value: 'openrouter/meta-llama/llama-4-maverick', label: 'Llama 4 Maverick' },
    { value: 'openrouter/meta-llama/llama-4-scout', label: 'Llama 4 Scout' },
    { value: 'openrouter/google/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro (via OR)' },
    { value: 'openrouter/mistralai/mistral-large-2411', label: 'Mistral Large (via OR)' },
]

/**
 * Fetch live model list from OpenRouter's public models API.
 * Models are prefixed with 'openrouter/' to match our internal naming convention.
 *
 * Note: The /api/v1/models endpoint is public and doesn't require auth,
 * but we only enable the query when the user has an active OpenRouter key.
 * Falls back to a curated popular models list if the API is unreachable.
 */
export function useOpenRouterModels(enabled: boolean) {
    const {
        data: models,
        isLoading,
        error,
    } = useQuery<ModelOption[]>({
        queryKey: ['openrouter-models'],
        queryFn: async () => {
            const res = await fetch('https://openrouter.ai/api/v1/models')
            if (!res.ok) {
                throw new Error(`OpenRouter models API returned ${res.status}`)
            }
            const json = (await res.json()) as { data: OpenRouterModel[] }

            return json.data
                .filter((m) => !m.id.includes(':free')) // Exclude free-tier variants
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((m) => ({
                    value: `openrouter/${m.id}`,
                    label: m.name,
                }))
        },
        enabled,
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 1,
    })

    // Return live models, or fallback if fetch failed or not yet loaded
    const resolvedModels = models && models.length > 0 ? models : (error || !enabled ? FALLBACK_MODELS : [])

    return { models: resolvedModels, isLoading, error }
}
