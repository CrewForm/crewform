import OpenAI from 'openai';
import type { TokenUsage } from '../types';

export async function executeOpenAI(
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string,
    onChunk: (text: string) => Promise<void>,
    baseURL?: string,
    maxTokens?: number | null
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
                await onChunk(fullText); // Send the accumulated text so far
            }
        }
        if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
        }
    }

    // Very rough estimate: $5/1M input, $15/1M output
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
