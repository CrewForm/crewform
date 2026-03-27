// SPDX-License-Identifier: AGPL-3.0-or-later
// AG-UI Protocol Server — SSE endpoint for streaming agent execution events.
// Mounts at POST /ag-ui/:agentId/sse

import type { IncomingMessage, ServerResponse } from 'http';
import { supabase } from './supabase';
import { agUiEventBus } from './agUiEventBus';
import type { AgUiEvent } from './agUiEventBus';

// ─── Auth ───────────────────────────────────────────────────────────────────

async function authenticateRequest(
    req: IncomingMessage,
): Promise<{ workspaceId: string } | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);

    const { data } = await supabase
        .from('api_keys')
        .select('workspace_id')
        .eq('provider', 'ag-ui')
        .eq('encrypted_key', token)
        .single();

    // Fall back to a2a key if no ag-ui specific key
    if (!data) {
        const { data: a2aData } = await supabase
            .from('api_keys')
            .select('workspace_id')
            .eq('provider', 'a2a')
            .eq('encrypted_key', token)
            .single();

        if (!a2aData) return null;
        return { workspaceId: a2aData.workspace_id as string };
    }

    return { workspaceId: data.workspace_id as string };
}

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

// ─── SSE Endpoint ───────────────────────────────────────────────────────────

/**
 * Handle AG-UI protocol requests.
 * Routes:
 *   POST /ag-ui/:agentId/sse  — SSE event stream
 *   OPTIONS /ag-ui/*           — CORS preflight
 *
 * Returns true if the request was handled, false otherwise.
 */
export async function handleAgUiRequest(
    req: IncomingMessage,
    res: ServerResponse,
): Promise<boolean> {
    const url = req.url ?? '';

    // CORS preflight
    if (req.method === 'OPTIONS' && url.startsWith('/ag-ui/')) {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        });
        res.end();
        return true;
    }

    // POST /ag-ui/:agentId/sse — SSE stream
    const sseMatch = url.match(/^\/ag-ui\/([^/]+)\/sse/);
    if (req.method === 'POST' && sseMatch) {
        const agentId = sseMatch[1];

        // Authenticate
        const auth = await authenticateRequest(req);
        if (!auth) {
            sendJson(res, 401, { error: 'Unauthorized — provide Bearer token' });
            return true;
        }

        // Parse RunAgentInput
        let input: {
            threadId?: string;
            runId?: string;
            messages?: unknown[];
            tools?: unknown[];
            context?: unknown[];
        };
        try {
            const body = await readBody(req);
            input = JSON.parse(body) as typeof input;
        } catch {
            sendJson(res, 400, { error: 'Invalid JSON body' });
            return true;
        }

        // Verify agent belongs to workspace
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name')
            .eq('id', agentId)
            .eq('workspace_id', auth.workspaceId)
            .single();

        if (!agent) {
            sendJson(res, 404, { error: 'Agent not found in workspace' });
            return true;
        }

        // The threadId maps to a CrewForm task ID
        const taskId = input.threadId;
        if (!taskId) {
            sendJson(res, 400, { error: 'threadId is required (maps to task ID)' });
            return true;
        }

        // Set up SSE response
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'X-Accel-Buffering': 'no', // Disable buffering on nginx/proxies
        });

        // Send initial comment to keep connection alive
        res.write(':ok\n\n');

        // Subscribe to AG-UI events for this task
        const stream = agUiEventBus.subscribe(taskId);

        // Handle client disconnect
        let disconnected = false;
        req.on('close', () => {
            disconnected = true;
        });

        // Stream events as SSE
        try {
            for await (const event of stream) {
                if (disconnected) break;

                const sseData = `data: ${JSON.stringify(event)}\n\n`;
                res.write(sseData);
            }
        } catch {
            // Client disconnected or stream error — clean exit
        }

        res.end();
        return true;
    }

    // GET /ag-ui/health — health check for AG-UI
    if (req.method === 'GET' && url === '/ag-ui/health') {
        sendJson(res, 200, { status: 'ok', protocol: 'ag-ui', version: '1.0' });
        return true;
    }

    return false;
}
