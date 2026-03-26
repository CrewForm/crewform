// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// mcp-discover — Proxy for MCP tool discovery.
// Sends JSON-RPC initialize + tools/list to an MCP server from the server side,
// bypassing browser CORS restrictions.
//
// Always returns HTTP 200 with { tools, error } so that
// supabase.functions.invoke() doesn't swallow the error body.

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface McpJsonRpcResponse {
    jsonrpc: '2.0';
    id: number;
    result?: {
        tools?: Array<{ name: string; description?: string; inputSchema?: unknown }>;
        protocolVersion?: string;
        capabilities?: unknown;
        serverInfo?: { name?: string; version?: string };
    };
    error?: { code: number; message: string };
}

function jsonOk(body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

/** Parse a response that could be JSON or SSE, returning the parsed JSON-RPC object */
async function parseResponse(res: Response): Promise<McpJsonRpcResponse | null> {
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/event-stream')) {
        const text = await res.text();
        const match = /^data: (.+)$/m.exec(text);
        if (match) return JSON.parse(match[1]) as McpJsonRpcResponse;
        return null;
    }
    return await res.json() as McpJsonRpcResponse;
}

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    if (req.method !== 'POST') {
        return jsonOk({ error: 'Method not allowed' });
    }

    try {
        // Auth: require a valid JWT
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return jsonOk({ error: 'Missing authorization header' });
        }

        const token = authHeader.replace('Bearer ', '');
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        });

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return jsonOk({ error: 'Unauthorized: ' + (authError?.message ?? 'invalid token') });
        }

        // Parse request body
        const body = await req.json() as {
            server_url: string;
            server_headers?: Record<string, string>;
        };

        if (!body.server_url) {
            return jsonOk({ error: 'server_url is required' });
        }

        console.log(`[mcp-discover] Connecting to: ${body.server_url}`);

        const mcpHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            ...(body.server_headers ?? {}),
        };

        // 1. Initialize
        let initRes: Response;
        try {
            initRes = await fetch(body.server_url, {
                method: 'POST',
                headers: mcpHeaders,
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {
                        protocolVersion: '2025-03-26',
                        capabilities: {},
                        clientInfo: { name: 'crewform', version: '1.0.0' },
                    },
                }),
            });
        } catch (fetchErr: unknown) {
            const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            return jsonOk({ error: `Failed to connect to MCP server: ${msg}` });
        }

        if (!initRes.ok) {
            const text = await initRes.text();
            return jsonOk({ error: `MCP server returned ${initRes.status}: ${text}` });
        }

        // Capture session ID
        const sessionId = initRes.headers.get('mcp-session-id');
        if (sessionId) {
            mcpHeaders['mcp-session-id'] = sessionId;
        }

        // Parse init response
        const initResult = await parseResponse(initRes);
        if (initResult?.error) {
            return jsonOk({ error: `MCP initialize failed: ${initResult.error.message}` });
        }

        console.log('[mcp-discover] Initialized, listing tools...');

        // 2. Send initialized notification (fire-and-forget)
        void fetch(body.server_url, {
            method: 'POST',
            headers: mcpHeaders,
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'notifications/initialized',
            }),
        });

        // 3. List tools
        let toolsRes: Response;
        try {
            toolsRes = await fetch(body.server_url, {
                method: 'POST',
                headers: mcpHeaders,
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'tools/list',
                    params: {},
                }),
            });
        } catch (fetchErr: unknown) {
            const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            return jsonOk({ error: `tools/list fetch failed: ${msg}` });
        }

        if (!toolsRes.ok) {
            return jsonOk({ error: `tools/list failed: HTTP ${toolsRes.status}` });
        }

        const toolsResult = await parseResponse(toolsRes);
        if (toolsResult?.error) {
            return jsonOk({ error: `tools/list failed: ${toolsResult.error.message}` });
        }

        const tools = (toolsResult?.result?.tools ?? []).map((t) => ({
            name: t.name,
            description: t.description,
        }));

        console.log(`[mcp-discover] Found ${tools.length} tools`);

        return jsonOk({ tools });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[mcp-discover] Error:', message);
        return jsonOk({ error: message });
    }
});
