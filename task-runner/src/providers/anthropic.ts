import Anthropic from '@anthropic-ai/sdk';
import type { TokenUsage } from '../types';

export async function executeAnthropic(
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string,
    onChunk: (text: string) => Promise<void>,
    maxTokens?: number | null
): Promise<{ result: string; usage: TokenUsage }> {
    const anthropic = new Anthropic({ apiKey });
    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;

    const stream = await anthropic.messages.create({
        model,
        max_tokens: maxTokens ?? 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        stream: true,
    });

    for await (const chunk of stream) {
        if (chunk.type === 'message_start') {
            promptTokens = chunk.message.usage.input_tokens;
        } else if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullText += chunk.delta.text;
            await onChunk(fullText);
        } else if (chunk.type === 'message_delta') {
            completionTokens = chunk.usage.output_tokens;
        }
    }

    // Very rough estimate: $3/1M input, $15/1M output
    const costEstimateUSD = (promptTokens / 1_000_000) * 3 + (completionTokens / 1_000_000) * 15;

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
