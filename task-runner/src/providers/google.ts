import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TokenUsage } from '../types';

export async function executeGoogle(
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string,
    onChunk: (text: string) => Promise<void>,
    maxTokens?: number | null
): Promise<{ result: string; usage: TokenUsage }> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({
        model,
        systemInstruction: systemPrompt,
        ...(maxTokens != null ? { generationConfig: { maxOutputTokens: maxTokens } } : {}),
    });

    let fullText = '';

    const result = await genModel.generateContentStream(userPrompt);

    for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullText += chunkText;
        await onChunk(fullText);
    }

    const response = await result.response;

    let promptTokens = 0;
    let completionTokens = 0;

    if (response.usageMetadata) {
        promptTokens = response.usageMetadata.promptTokenCount;
        completionTokens = response.usageMetadata.candidatesTokenCount;
    }

    // Very rough estimate
    const costEstimateUSD = (promptTokens / 1_000_000) * 0.15 + (completionTokens / 1_000_000) * 0.60;

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
