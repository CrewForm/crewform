// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// kb-process — Process a knowledge base document.
// Downloads from Storage → extracts text → chunks → embeds → stores in knowledge_chunks.

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CHUNK_SIZE = 1000;      // ~500 tokens
const CHUNK_OVERLAP = 200;    // overlap between chunks
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_BATCH_SIZE = 20;

function jsonOk(body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// ─── Text Extraction ────────────────────────────────────────────────────────

function extractText(content: string, fileType: string): string {
    // CSV: join rows with newlines
    if (fileType === 'text/csv') {
        return content;
    }
    // JSON: pretty-print
    if (fileType === 'application/json') {
        try {
            return JSON.stringify(JSON.parse(content), null, 2);
        } catch {
            return content;
        }
    }
    // TXT, MD, HTML — use as-is (strip HTML tags for HTML)
    if (fileType === 'text/html') {
        return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return content;
}

// ─── Chunking ───────────────────────────────────────────────────────────────

interface Chunk {
    content: string;
    index: number;
}

function chunkText(text: string): Chunk[] {
    const chunks: Chunk[] = [];
    let start = 0;
    let index = 0;

    while (start < text.length) {
        let end = start + CHUNK_SIZE;

        // Try to break at a paragraph or sentence boundary
        if (end < text.length) {
            const slice = text.slice(start, end + 200);
            // Look for paragraph break
            const paraBreak = slice.lastIndexOf('\n\n');
            if (paraBreak > CHUNK_SIZE * 0.5) {
                end = start + paraBreak + 2;
            } else {
                // Look for sentence break
                const sentenceBreak = slice.search(/[.!?]\s/);
                if (sentenceBreak > CHUNK_SIZE * 0.5) {
                    end = start + sentenceBreak + 2;
                }
            }
        }

        const chunk = text.slice(start, Math.min(end, text.length)).trim();
        if (chunk.length > 0) {
            chunks.push({ content: chunk, index });
            index++;
        }

        start = Math.max(start + 1, end - CHUNK_OVERLAP);
    }

    return chunks;
}

// ─── Embedding ──────────────────────────────────────────────────────────────

interface EmbeddingKeyResult {
    apiKey: string;
    baseURL?: string;
}

async function getEmbeddingKey(
    supabase: ReturnType<typeof createClient>,
    workspaceId: string,
): Promise<EmbeddingKeyResult | null> {
    // Try OpenAI first
    const { data: openaiKey } = await supabase
        .from('api_keys')
        .select('encrypted_key')
        .eq('workspace_id', workspaceId)
        .ilike('provider', 'openai')
        .maybeSingle();

    if (openaiKey) {
        // Decrypt key — Edge Functions use the same encryption as task runner
        // For now, pass as-is (encrypted_key is stored encrypted but accessible via service role)
        return { apiKey: (openaiKey as { encrypted_key: string }).encrypted_key };
    }

    // Fallback: OpenRouter
    const { data: routerKey } = await supabase
        .from('api_keys')
        .select('encrypted_key')
        .eq('workspace_id', workspaceId)
        .ilike('provider', 'openrouter')
        .maybeSingle();

    if (routerKey) {
        return {
            apiKey: (routerKey as { encrypted_key: string }).encrypted_key,
            baseURL: 'https://openrouter.ai/api/v1',
        };
    }

    return null;
}

async function generateEmbeddings(
    texts: string[],
    apiKey: string,
    baseURL?: string,
): Promise<number[][]> {
    const url = baseURL
        ? `${baseURL}/embeddings`
        : 'https://api.openai.com/v1/embeddings';

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: texts.map((t) => t.slice(0, 8000)),
            dimensions: 1536,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Embedding API error: ${response.status} ${text}`);
    }

    const result = await response.json() as {
        data: Array<{ embedding: number[] }>;
    };

    return result.data.map((d) => d.embedding);
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    if (req.method !== 'POST') {
        return jsonOk({ error: 'Method not allowed' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Use service role for processing (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // Auth check
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return jsonOk({ error: 'Missing authorization' });
        }

        const token = authHeader.replace('Bearer ', '');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) {
            return jsonOk({ error: 'Unauthorized' });
        }

        const body = await req.json() as { document_id: string };
        if (!body.document_id) {
            return jsonOk({ error: 'document_id is required' });
        }

        console.log(`[kb-process] Processing document: ${body.document_id}`);

        // 1. Fetch document metadata
        const { data: doc, error: docError } = await supabase
            .from('knowledge_documents')
            .select('*')
            .eq('id', body.document_id)
            .single();

        if (docError || !doc) {
            return jsonOk({ error: `Document not found: ${docError?.message ?? 'unknown'}` });
        }

        const document = doc as {
            id: string;
            workspace_id: string;
            storage_path: string;
            file_type: string;
            file_name: string;
        };

        // 2. Update status to processing
        await supabase
            .from('knowledge_documents')
            .update({ status: 'processing', error_message: null })
            .eq('id', document.id);

        // 3. Download file from storage
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('knowledge')
            .download(document.storage_path);

        if (downloadError || !fileData) {
            await supabase
                .from('knowledge_documents')
                .update({ status: 'error', error_message: `Download failed: ${downloadError?.message}` })
                .eq('id', document.id);
            return jsonOk({ error: `Download failed: ${downloadError?.message}` });
        }

        // 4. Extract text
        const rawText = await fileData.text();
        const text = extractText(rawText, document.file_type);

        if (text.trim().length === 0) {
            await supabase
                .from('knowledge_documents')
                .update({ status: 'error', error_message: 'No text content found in file' })
                .eq('id', document.id);
            return jsonOk({ error: 'No text content found' });
        }

        console.log(`[kb-process] Extracted ${text.length} chars from ${document.file_name}`);

        // 5. Chunk text
        const chunks = chunkText(text);
        console.log(`[kb-process] Created ${chunks.length} chunks`);

        // 6. Get embedding key
        const embeddingKey = await getEmbeddingKey(supabase, document.workspace_id);
        if (!embeddingKey) {
            await supabase
                .from('knowledge_documents')
                .update({ status: 'error', error_message: 'No OpenAI or OpenRouter API key found. Add one in Settings → LLM Setup.' })
                .eq('id', document.id);
            return jsonOk({ error: 'No embedding API key found' });
        }

        // 7. Delete existing chunks (in case of re-processing)
        await supabase
            .from('knowledge_chunks')
            .delete()
            .eq('document_id', document.id);

        // 8. Embed and store chunks in batches
        let storedCount = 0;
        for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
            const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
            const texts = batch.map((c) => c.content);

            try {
                const embeddings = await generateEmbeddings(
                    texts,
                    embeddingKey.apiKey,
                    embeddingKey.baseURL,
                );

                const rows = batch.map((chunk, j) => ({
                    document_id: document.id,
                    workspace_id: document.workspace_id,
                    content: chunk.content,
                    chunk_index: chunk.index,
                    embedding: `[${embeddings[j].join(',')}]`,
                    metadata: {
                        file_name: document.file_name,
                        chunk_of: chunks.length,
                    },
                }));

                const { error: insertError } = await supabase
                    .from('knowledge_chunks')
                    .insert(rows);

                if (insertError) {
                    console.error(`[kb-process] Chunk insert error:`, insertError.message);
                } else {
                    storedCount += batch.length;
                }
            } catch (embedErr: unknown) {
                const msg = embedErr instanceof Error ? embedErr.message : String(embedErr);
                console.error(`[kb-process] Embedding batch error:`, msg);
                await supabase
                    .from('knowledge_documents')
                    .update({ status: 'error', error_message: msg })
                    .eq('id', document.id);
                return jsonOk({ error: `Embedding failed: ${msg}` });
            }
        }

        // 9. Update document status
        await supabase
            .from('knowledge_documents')
            .update({ status: 'ready', chunk_count: storedCount })
            .eq('id', document.id);

        console.log(`[kb-process] ✓ Document ${document.id} ready — ${storedCount} chunks stored`);

        return jsonOk({ success: true, chunk_count: storedCount });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[kb-process] Error:', message);
        return jsonOk({ error: message });
    }
});
