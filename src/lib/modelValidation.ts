// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { MODEL_OPTIONS } from '@/lib/agentSchema'

/**
 * Build a set of all known model IDs from the static MODEL_OPTIONS.
 * Used to validate whether an agent's model is still available.
 */
function buildStaticModelSet(): Set<string> {
    const set = new Set<string>()
    for (const group of MODEL_OPTIONS) {
        for (const m of group.models) {
            set.add(m.value)
        }
    }
    return set
}

const staticModelSet = buildStaticModelSet()

/**
 * Check if a model ID is known (exists in the model catalog).
 * For dynamic providers like OpenRouter, pass their live model list.
 *
 * @param model - The model ID stored on the agent
 * @param dynamicModels - Optional array of dynamic model values (e.g. from OpenRouter)
 * @returns true if the model is recognized, false if it may be stale/invalid
 */
export function isKnownModel(
    model: string,
    dynamicModels?: string[],
): boolean {
    // Static providers (Anthropic, OpenAI, Google, etc.)
    if (staticModelSet.has(model)) return true

    // Dynamic models (OpenRouter, Ollama, etc.)
    if (dynamicModels && dynamicModels.includes(model)) return true

    // Models with custom provider prefixes that we don't validate
    // (user may have typed a custom model ID intentionally)
    // We only flag models from known providers whose list we have
    return false
}

/**
 * Get a human-readable suggestion for a stale model.
 */
export function getStaleSuggestion(model: string): string {
    const lower = model.toLowerCase()

    if (lower.includes('gemini-2.0-flash')) {
        return 'Try "gemini-2.5-flash" (Google) or search OpenRouter for the latest Gemini models.'
    }
    if (lower.includes('gpt-4-turbo')) {
        return 'Try "gpt-4o" or "gpt-4.1" — GPT-4 Turbo has been superseded.'
    }
    if (lower.includes('claude-3-opus')) {
        return 'Try "claude-opus-4" — Claude 3 Opus has been replaced by Claude Opus 4.'
    }
    if (lower.includes('claude-3-sonnet') || lower.includes('claude-3.5-sonnet')) {
        return 'Try "claude-sonnet-4" — the latest Sonnet model.'
    }

    return 'This model may have been renamed or deprecated. Select a current model from the dropdown.'
}
