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
 * Returns null on any failure.
 */
async function generateEmbedding(
    text: string,
    apiKey: string,
    baseURL?: string,
): Promise<number[] | null> {
    try {
        const openai = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: text.slice(0, 8000), // Avoid exceeding token limits
            dimensions: EMBEDDING_DIMS,
        });
        return response.data[0].embedding;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[TeamMemory] Embedding generation failed: ${msg}`);
        return null;
    }
}

// ─── Memory Storage ─────────────────────────────────────────────────────────

/**
 * Store a team run output as a memory entry.
 * Always stores the content. Embedding is best-effort — if it fails,
 * the memory is stored without an embedding (can be back-filled later).
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

        // Summarise long outputs to keep memory focused
        const memoryContent = content.length > 2000
            ? `${content.slice(0, 2000)}…`
            : content;

        // Try to get an embedding key and generate an embedding (best-effort)
        let embeddingStr: string | null = null;
        const keyResult = await getEmbeddingKey(workspaceId);
        if (keyResult) {
            console.log(`[TeamMemory] Using ${keyResult.provider} key for embeddings`);
            const embedding = await generateEmbedding(memoryContent, keyResult.apiKey, keyResult.baseURL);
            if (embedding) {
                embeddingStr = `[${embedding.join(',')}]`;
                console.log(`[TeamMemory] Embedding generated (${embedding.length} dimensions)`);
            } else {
                console.warn(`[TeamMemory] Embedding failed, storing memory without embedding`);
            }
        } else {
            console.log(`[TeamMemory] No embedding key found, storing memory without embedding`);
        }

        // Build insert payload — always store content, embedding is optional
        const insertPayload: Record<string, unknown> = {
            team_id: teamId,
            run_id: runId,
            content: memoryContent,
            metadata: {
                source: 'team_run',
                content_length: content.length,
                has_embedding: embeddingStr !== null,
                stored_at: new Date().toISOString(),
            },
        };

        if (embeddingStr) {
            insertPayload.embedding = embeddingStr;
        }

        console.log(`[TeamMemory] Inserting memory into team_memory table…`);
        const { error } = await supabase
            .from('team_memory')
            .insert(insertPayload);

        if (error) {
            console.error(`[TeamMemory] Supabase insert failed:`, error.message, error.details, error.hint);
        } else {
            console.log(`[TeamMemory] ✓ Memory stored for team ${teamId}, run ${runId} (embedding: ${embeddingStr ? 'yes' : 'no'})`);
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
            // No embedding key — fall back to fetching recent memories by date
            return fetchRecentMemories(teamId, topK);
        }

        const embedding = await generateEmbedding(query, keyResult.apiKey, keyResult.baseURL);
        if (!embedding) {
            // Embedding failed — fall back to recent memories
            return fetchRecentMemories(teamId, topK);
        }

        const { data, error } = await supabase.rpc('match_team_memories', {
            p_team_id: teamId,
            p_embedding: `[${embedding.join(',')}]`,
            p_match_count: topK,
        });

        if (error) {
            console.error(`[TeamMemory] RPC search failed:`, error.message);
            // Fall back to recent memories if the RPC function doesn't exist yet
            return fetchRecentMemories(teamId, topK);
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

/**
 * Simple fallback: fetch the most recent memories by creation date.
 * Used when embeddings or the match RPC function aren't available.
 */
async function fetchRecentMemories(teamId: string, limit: number): Promise<string[]> {
    try {
        const { data, error } = await supabase
            .from('team_memory')
            .select('content')
            .eq('team_id', teamId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error || !data) return [];
        return (data as Array<{ content: string }>).map((r) => r.content);
    } catch {
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
        return {
            apiKey: decryptApiKey((openaiResult.data as ApiKey).encrypted_key),
            provider: 'OpenAI',
        };
    }

    // Fallback: OpenRouter
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
        return {
            apiKey: decryptApiKey((routerResult.data as ApiKey).encrypted_key),
            provider: 'OpenRouter',
            baseURL: 'https://openrouter.ai/api/v1',
        };
    }

    return null;
}
