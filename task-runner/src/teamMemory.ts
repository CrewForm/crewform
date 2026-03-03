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
): Promise<number[]> {
    const openai = new OpenAI({ apiKey });
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
        const apiKey = await getOpenAIKey(workspaceId);
        if (!apiKey) {
            console.log(`[TeamMemory] No OpenAI key for workspace ${workspaceId}, skipping memory storage`);
            return;
        }

        // Summarise long outputs to keep embeddings focused
        const memoryContent = content.length > 2000
            ? `${content.slice(0, 2000)}…`
            : content;

        const embedding = await generateEmbedding(memoryContent, apiKey);

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
            console.error(`[TeamMemory] Failed to store memory:`, error.message);
        } else {
            console.log(`[TeamMemory] Stored memory for team ${teamId}, run ${runId}`);
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[TeamMemory] Error storing memory:`, msg);
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
        const apiKey = await getOpenAIKey(workspaceId);
        if (!apiKey) {
            return [];
        }

        const embedding = await generateEmbedding(query, apiKey);

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

/**
 * Find an OpenAI API key for the workspace (needed for embeddings).
 * Falls back to OpenRouter if no direct OpenAI key exists.
 */
async function getOpenAIKey(workspaceId: string): Promise<string | null> {
    // Try OpenAI first
    const { data: openaiKey } = await supabase
        .from('api_keys')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('provider', 'openai')
        .single();

    if (openaiKey) {
        return decryptApiKey((openaiKey as ApiKey).encrypted_key);
    }

    // Fallback: try OpenRouter (it supports embeddings too)
    const { data: routerKey } = await supabase
        .from('api_keys')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('provider', 'openrouter')
        .single();

    if (routerKey) {
        return decryptApiKey((routerKey as ApiKey).encrypted_key);
    }

    return null;
}
