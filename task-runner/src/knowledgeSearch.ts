// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm
//
// knowledgeSearch.ts — Search knowledge base chunks via vector similarity + hybrid search.

import OpenAI from 'openai';
import { supabase } from './supabase';
import { decryptApiKey } from './crypto';
import type { ApiKey } from './types';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536;
const DEFAULT_TOP_K = 5;

export interface KnowledgeSearchResult {
    content: string;
    document_name: string;
    similarity: number;
    chunk_index?: number;
    document_id?: string;
}

export interface HybridSearchResult extends KnowledgeSearchResult {
    vector_similarity: number;
    text_rank: number;
    combined_score: number;
}

/**
 * Search the knowledge base for relevant chunks using vector similarity.
 * Embeds the query, then calls match_knowledge_chunks RPC.
 */
export async function searchKnowledge(
    workspaceId: string,
    documentIds: string[] | null,
    query: string,
    topK = DEFAULT_TOP_K,
    tags: string[] | null = null,
): Promise<KnowledgeSearchResult[]> {
    // 1. Get embedding key
    const keyResult = await getEmbeddingKey(workspaceId);
    if (!keyResult) {
        console.warn('[KnowledgeSearch] No embedding key found, falling back to text search');
        return fallbackTextSearch(workspaceId, documentIds, query, topK);
    }

    // 2. Embed the query
    const embedding = await generateEmbedding(query, keyResult.apiKey, keyResult.baseURL);
    if (!embedding) {
        console.warn('[KnowledgeSearch] Embedding failed, falling back to text search');
        return fallbackTextSearch(workspaceId, documentIds, query, topK);
    }

    // 3. Vector similarity search
    const { data, error } = await supabase.rpc('match_knowledge_chunks', {
        p_workspace_id: workspaceId,
        p_document_ids: documentIds,
        p_embedding: `[${embedding.join(',')}]`,
        p_match_count: topK,
        p_tags: tags,
    });

    if (error) {
        console.error('[KnowledgeSearch] RPC error:', error.message);
        return fallbackTextSearch(workspaceId, documentIds, query, topK);
    }

    const rows = data as Array<{
        content: string;
        document_id: string;
        chunk_index: number;
        similarity: number;
        metadata: { file_name?: string };
    }> | null;

    if (!rows || rows.length === 0) return [];

    return rows
        .filter((r) => r.similarity > 0.3)
        .map((r) => ({
            content: r.content,
            document_name: r.metadata?.file_name ?? 'Unknown',
            similarity: r.similarity,
            chunk_index: r.chunk_index,
            document_id: r.document_id,
        }));
}

/**
 * Hybrid search — combines vector similarity with full-text search,
 * then reranks using a weighted score.
 */
export async function searchKnowledgeHybrid(
    workspaceId: string,
    documentIds: string[] | null,
    query: string,
    topK = DEFAULT_TOP_K,
    tags: string[] | null = null,
    vectorWeight = 0.7,
    textWeight = 0.3,
): Promise<HybridSearchResult[]> {
    // 1. Get embedding key
    const keyResult = await getEmbeddingKey(workspaceId);
    if (!keyResult) {
        console.warn('[KnowledgeSearch] No embedding key found, falling back to vector-only');
        const results = await searchKnowledge(workspaceId, documentIds, query, topK, tags);
        return results.map(r => ({
            ...r,
            vector_similarity: r.similarity,
            text_rank: 0,
            combined_score: r.similarity,
        }));
    }

    // 2. Embed the query
    const embedding = await generateEmbedding(query, keyResult.apiKey, keyResult.baseURL);
    if (!embedding) {
        console.warn('[KnowledgeSearch] Embedding failed, falling back to text search');
        const fallback = await fallbackTextSearch(workspaceId, documentIds, query, topK);
        return fallback.map(r => ({
            ...r,
            vector_similarity: 0,
            text_rank: r.similarity,
            combined_score: r.similarity,
        }));
    }

    // 3. Hybrid search RPC
    const { data, error } = await supabase.rpc('hybrid_search_knowledge', {
        p_workspace_id: workspaceId,
        p_document_ids: documentIds,
        p_embedding: `[${embedding.join(',')}]`,
        p_query: query,
        p_match_count: topK,
        p_tags: tags,
        p_vector_weight: vectorWeight,
        p_text_weight: textWeight,
    });

    if (error) {
        console.error('[KnowledgeSearch] Hybrid RPC error:', error.message);
        // Fall back to vector-only
        return (await searchKnowledge(workspaceId, documentIds, query, topK, tags)).map(r => ({
            ...r,
            vector_similarity: r.similarity,
            text_rank: 0,
            combined_score: r.similarity,
        }));
    }

    const rows = data as Array<{
        content: string;
        document_id: string;
        chunk_index: number;
        metadata: { file_name?: string };
        vector_similarity: number;
        text_rank: number;
        combined_score: number;
    }> | null;

    if (!rows || rows.length === 0) return [];

    return rows
        .filter((r) => r.combined_score > 0.2)
        .map((r) => ({
            content: r.content,
            document_name: r.metadata?.file_name ?? 'Unknown',
            similarity: r.combined_score,
            chunk_index: r.chunk_index,
            document_id: r.document_id,
            vector_similarity: r.vector_similarity,
            text_rank: r.text_rank,
            combined_score: r.combined_score,
        }));
}

/**
 * Format search results as context for the LLM.
 */
export function formatKnowledgeResults(results: KnowledgeSearchResult[]): string {
    if (results.length === 0) {
        return 'No relevant information found in the knowledge base.';
    }

    return results
        .map((r, i) => `[${i + 1}] (from "${r.document_name}", relevance: ${(r.similarity * 100).toFixed(0)}%)\n${r.content}`)
        .join('\n\n---\n\n');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function generateEmbedding(
    text: string,
    apiKey: string,
    baseURL?: string,
): Promise<number[] | null> {
    try {
        const openai = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: text.slice(0, 8000),
            dimensions: EMBEDDING_DIMS,
        });
        return response.data[0].embedding;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[KnowledgeSearch] Embedding failed: ${msg}`);
        return null;
    }
}

interface EmbeddingKeyResult {
    apiKey: string;
    baseURL?: string;
}

async function getEmbeddingKey(workspaceId: string): Promise<EmbeddingKeyResult | null> {
    const openaiResult = await supabase
        .from('api_keys')
        .select('*')
        .eq('workspace_id', workspaceId)
        .ilike('provider', 'openai')
        .maybeSingle();

    if (openaiResult.data) {
        return {
            apiKey: decryptApiKey((openaiResult.data as ApiKey).encrypted_key),
        };
    }

    const routerResult = await supabase
        .from('api_keys')
        .select('*')
        .eq('workspace_id', workspaceId)
        .ilike('provider', 'openrouter')
        .maybeSingle();

    if (routerResult.data) {
        return {
            apiKey: decryptApiKey((routerResult.data as ApiKey).encrypted_key),
            baseURL: 'https://openrouter.ai/api/v1',
        };
    }

    return null;
}

/**
 * Fallback text search when embeddings aren't available.
 * Uses simple ILIKE matching on chunk content.
 */
async function fallbackTextSearch(
    workspaceId: string,
    documentIds: string[] | null,
    query: string,
    limit: number,
): Promise<KnowledgeSearchResult[]> {
    try {
        let q = supabase
            .from('knowledge_chunks')
            .select('content, metadata, chunk_index, document_id')
            .eq('workspace_id', workspaceId)
            .ilike('content', `%${query}%`)
            .limit(limit);

        if (documentIds && documentIds.length > 0) {
            q = q.in('document_id', documentIds);
        }

        const { data, error } = await q;
        if (error || !data) return [];

        return (data as Array<{ content: string; metadata: { file_name?: string }; chunk_index: number; document_id: string }>).map((r) => ({
            content: r.content,
            document_name: r.metadata?.file_name ?? 'Unknown',
            similarity: 0.5, // unknown similarity for text search
            chunk_index: r.chunk_index,
            document_id: r.document_id,
        }));
    } catch {
        return [];
    }
}
