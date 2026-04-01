// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'

interface OllamaModel {
    name: string
    model: string
    size: number
    digest: string
    modified_at: string
}

interface ModelOption {
    value: string
    label: string
}

/**
 * Format a model size in bytes to a human-readable string (e.g. "4.7 GB").
 */
function formatSize(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return `${gb.toFixed(1)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(0)} MB`
}

/**
 * Fetch locally installed models from an Ollama instance.
 *
 * Calls `GET {baseUrl}/api/tags` which returns the list of pulled models.
 * Falls back to the static hardcoded list if Ollama is unreachable.
 *
 * @param enabled - Whether the query should run (Ollama provider is active)
 * @param baseUrl - The Ollama base URL (e.g. http://localhost:11434)
 */
export function useOllamaModels(enabled: boolean, baseUrl: string = 'http://localhost:11434') {
    const {
        data: models,
        isLoading,
        error,
        refetch,
    } = useQuery<ModelOption[]>({
        queryKey: ['ollama-models', baseUrl],
        queryFn: async () => {
            // Ollama's /api/tags endpoint lists all locally installed models
            const url = `${baseUrl.replace(/\/+$/, '')}/api/tags`
            const res = await fetch(url)
            if (!res.ok) {
                throw new Error(`Ollama returned ${res.status}`)
            }
            const json = (await res.json()) as { models: OllamaModel[] }

            return json.models
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((m) => ({
                    value: m.name.includes(':') ? m.name : `${m.name}:latest`,
                    label: `${m.name} (${formatSize(m.size)})`,
                }))
        },
        enabled,
        staleTime: 30 * 1000, // 30 seconds — models don't change often
        retry: 1,
        // Don't throw on network errors — Ollama may just be offline
        throwOnError: false,
    })

    return {
        models: models ?? [],
        isLoading,
        error,
        refetch,
        isDiscovered: !!models && models.length > 0,
    }
}
