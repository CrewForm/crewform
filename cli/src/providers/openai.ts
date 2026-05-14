// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// providers/openai.ts — OpenAI-compatible streaming execution.
// Adapted from task-runner/src/providers/openai.ts for standalone CLI use.

import OpenAI from 'openai';
import type { TokenUsage } from '../types.js';

export async function executeOpenAI(
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string,
    onChunk: (text: string) => Promise<void> | void,
    baseURL?: string,
    maxTokens?: number | null,
): Promise<{ result: string; usage: TokenUsage }> {
    const openai = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    let fullText = '';

    const stream = await openai.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        stream: true,
        stream_options: { include_usage: true },
        ...(maxTokens != null ? { max_tokens: maxTokens } : {}),
    });

    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
        if (chunk.choices.length > 0) {
            const content = chunk.choices[0]?.delta?.content || '';
            fullText += content;
            if (content) {
                await onChunk(fullText);
            }
        }
        if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
        }
    }

    const costEstimateUSD = (promptTokens / 1_000_000) * 5 + (completionTokens / 1_000_000) * 15;

    return {
        result: fullText,
        usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            costEstimateUSD,
        },
    };
}
