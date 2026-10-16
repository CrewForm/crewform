// SPDX-License-Identifier: MIT
// Knowledge Base Search Endpoint — direct retrieval testing without task execution.
// Mounts at /kb/* on the task runner HTTP server.

import type { IncomingMessage, ServerResponse } from 'http';
import { supabase } from './supabase';
import { searchKnowledge, searchKnowledgeHybrid, formatKnowledgeResults } from './knowledgeSearch';

// ─── Helpers ────────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(JSON.stringify(data));
}

// ─── Auth ───────────────────────────────────────────────────────────────────

async function authenticateUser(req: IncomingMessage): Promise<{ userId: string; workspaceId: string } | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);

    // Verify the JWT with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    // Get the user's workspace
    const { data: membership } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

    if (!membership) return null;

    return {
        userId: user.id,
        workspaceId: (membership as { workspace_id: string }).workspace_id,
    };
}

// ─── Search Handler ─────────────────────────────────────────────────────────

interface KbSearchRequest {
    query: string;
    documentIds?: string[];
    tags?: string[];
    topK?: number;
    mode?: 'vector' | 'hybrid';
}

async function handleSearch(req: IncomingMessage, res: ServerResponse) {
    const auth = await authenticateUser(req);
    if (!auth) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
    }

    let body: KbSearchRequest;
    try {
        const raw = await readBody(req);
        body = JSON.parse(raw) as KbSearchRequest;
    } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
    }

    if (!body.query?.trim()) {
        sendJson(res, 400, { error: 'query is required' });
        return;
    }

    const topK = Math.min(Math.max(body.topK ?? 5, 1), 20);
    const mode = body.mode ?? 'hybrid';
    const startTime = Date.now();

    try {
        if (mode === 'hybrid') {
            const results = await searchKnowledgeHybrid(
                auth.workspaceId,
                body.documentIds ?? null,
                body.query,
                topK,
                body.tags ?? null,
            );

            sendJson(res, 200, {
                mode: 'hybrid',
                query: body.query,
                results,
                count: results.length,
                durationMs: Date.now() - startTime,
                formatted: formatKnowledgeResults(results),
            });
        } else {
            const results = await searchKnowledge(
                auth.workspaceId,
                body.documentIds ?? null,
                body.query,
                topK,
                body.tags ?? null,
            );

            sendJson(res, 200, {
                mode: 'vector',
                query: body.query,
                results,
                count: results.length,
                durationMs: Date.now() - startTime,
                formatted: formatKnowledgeResults(results),
            });
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[KB Search] Error: ${msg}`);
        sendJson(res, 500, { error: `Search failed: ${msg}` });
    }
}

// ─── Main Request Handler ───────────────────────────────────────────────────

export async function handleKbSearchRequest(
    req: IncomingMessage,
    res: ServerResponse,
): Promise<boolean> {
    const url = req.url ?? '';

    if (!url.startsWith('/kb/')) return false;

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        });
        res.end();
        return true;
    }

    // POST /kb/search
    if (req.method === 'POST' && url.split('?')[0] === '/kb/search') {
        await handleSearch(req, res);
        return true;
    }

    return false;
}
