// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// teamMemory.ts — Embed team run outputs and retrieve relevant past memories.

import OpenAI from 'openai';
import { supabase } from './supabase';
import { decryptApiKey } from './crypto';
import type { ApiKey } from './types';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536;

// ─── Embedding ──────────────────────────────────────────────────────────────

/**
 * Generate an embedding vector for the given text using OpenAI's API.
 */
async function generateEmbedding(
    text: string,
    apiKey: string,
    baseURL?: string,
): Promise<number[]> {
    const openai = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000), // Avoid exceeding token limits
        dimensions: EMBEDDING_DIMS,
    });
    return response.data[0].embedding;
}

// ─── Memory Storage ─────────────────────────────────────────────────────────

/**
 * Store a team run output as a memory entry with its embedding.
 * Fire-and-forget: failures are logged but never throw.
 */
export async function storeTeamMemory(
    teamId: string,
    runId: string,
    workspaceId: string,
    content: string,
): Promise<void> {
    try {
        console.log(`[TeamMemory] storeTeamMemory called — team=${teamId}, run=${runId}, contentLen=${content.length}`);

        if (!content || content.trim().length === 0) {
            console.log(`[TeamMemory] Empty content, skipping memory storage`);
            return;
        }

        const keyResult = await getEmbeddingKey(workspaceId);
        if (!keyResult) {
            console.log(`[TeamMemory] No embedding-capable API key for workspace ${workspaceId}, skipping`);
            return;
        }

        console.log(`[TeamMemory] Using ${keyResult.provider} key for embeddings`);

        // Summarise long outputs to keep embeddings focused
        const memoryContent = content.length > 2000
            ? `${content.slice(0, 2000)}…`
            : content;

        console.log(`[TeamMemory] Generating embedding (${memoryContent.length} chars)…`);
        const embedding = await generateEmbedding(memoryContent, keyResult.apiKey, keyResult.baseURL);
        console.log(`[TeamMemory] Embedding generated (${embedding.length} dimensions)`);

        const { error } = await supabase
            .from('team_memory')
            .insert({
                team_id: teamId,
                run_id: runId,
                content: memoryContent,
                embedding: `[${embedding.join(',')}]`,
                metadata: {
                    source: 'team_run',
                    content_length: content.length,
                    stored_at: new Date().toISOString(),
                },
            });

        if (error) {
            console.error(`[TeamMemory] Supabase insert failed:`, error.message, error.details, error.hint);
        } else {
            console.log(`[TeamMemory] ✓ Memory stored for team ${teamId}, run ${runId}`);
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[TeamMemory] Error storing memory:`, msg);
        if (err instanceof Error && err.stack) {
            console.error(`[TeamMemory] Stack:`, err.stack);
        }
    }
}

// ─── Memory Retrieval ───────────────────────────────────────────────────────

/**
 * Retrieve the most relevant past memories for a team given a query string.
 * Returns an array of content strings ordered by relevance.
 */
export async function retrieveRelevantMemories(
    teamId: string,
    workspaceId: string,
    query: string,
    topK = 5,
): Promise<string[]> {
    try {
        const keyResult = await getEmbeddingKey(workspaceId);
        if (!keyResult) {
            return [];
        }

        const embedding = await generateEmbedding(query, keyResult.apiKey, keyResult.baseURL);

        const { data, error } = await supabase.rpc('match_team_memories', {
            p_team_id: teamId,
            p_embedding: `[${embedding.join(',')}]`,
            p_match_count: topK,
        });

        if (error) {
            console.error(`[TeamMemory] Search failed:`, error.message);
            return [];
        }

        const rows = data as Array<{ content: string; similarity: number }> | null;
        if (!rows || rows.length === 0) return [];

        // Only return memories with a reasonable similarity threshold
        return rows
            .filter((r) => r.similarity > 0.3)
            .map((r) => r.content);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[TeamMemory] Error retrieving memories:`, msg);
        return [];
    }
}

// ─── Prompt Injection ───────────────────────────────────────────────────────

/**
 * Build a prompt section with relevant team memories.
 * Returns empty string if no memories found.
 */
export function buildMemoryContext(memories: string[]): string {
    if (memories.length === 0) return '';

    const formatted = memories
        .map((m, i) => `${i + 1}. ${m}`)
        .join('\n\n');

    return `\n\n## Team Memory\nThe following are relevant past outputs from this team. Use them as context to improve your response:\n\n${formatted}`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface EmbeddingKeyResult {
    apiKey: string;
    provider: string;
    baseURL?: string;
}

/**
 * Find an API key capable of generating embeddings.
 * Tries OpenAI first (native), then OpenRouter (via its OpenAI-compatible API).
 */
async function getEmbeddingKey(workspaceId: string): Promise<EmbeddingKeyResult | null> {
    console.log(`[TeamMemory] Looking up embedding key for workspace ${workspaceId}`);

    // Try OpenAI first — best for embeddings
    const openaiResult = await supabase
        .from('api_keys')
        .select('*')
        .eq('workspace_id', workspaceId)
        .ilike('provider', 'openai')
        .maybeSingle();

    if (openaiResult.error) {
        console.error(`[TeamMemory] OpenAI key lookup error:`, openaiResult.error.message);
    }

    if (openaiResult.data) {
        console.log(`[TeamMemory] Found OpenAI key`);
        return {
            apiKey: decryptApiKey((openaiResult.data as ApiKey).encrypted_key),
            provider: 'OpenAI',
        };
    }

    // Fallback: OpenRouter (supports embeddings via OpenAI-compatible endpoint)
    const routerResult = await supabase
        .from('api_keys')
        .select('*')
        .eq('workspace_id', workspaceId)
        .ilike('provider', 'openrouter')
        .maybeSingle();

    if (routerResult.error) {
        console.error(`[TeamMemory] OpenRouter key lookup error:`, routerResult.error.message);
    }

    if (routerResult.data) {
        console.log(`[TeamMemory] Found OpenRouter key (fallback)`);
        return {
            apiKey: decryptApiKey((routerResult.data as ApiKey).encrypted_key),
            provider: 'OpenRouter',
            baseURL: 'https://openrouter.ai/api/v1',
        };
    }

    console.log(`[TeamMemory] No OpenAI or OpenRouter key found`);
    return null;
}
