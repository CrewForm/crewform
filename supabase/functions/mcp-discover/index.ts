// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// mcp-discover — Proxy for MCP tool discovery.
// Sends JSON-RPC initialize + tools/list to an MCP server from the server side,
// bypassing browser CORS restrictions.

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

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        // Auth: require a valid JWT
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: 'Missing authorization' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const token = authHeader.replace('Bearer ', '');
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        });

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Parse request body
        const body = await req.json() as {
            server_url: string;
            server_headers?: Record<string, string>;
        };

        if (!body.server_url) {
            return new Response(JSON.stringify({ error: 'server_url is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const mcpHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            ...(body.server_headers ?? {}),
        };

        // 1. Initialize
        const initRes = await fetch(body.server_url, {
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

        if (!initRes.ok) {
            const text = await initRes.text();
            return new Response(JSON.stringify({ error: `MCP server returned ${initRes.status}: ${text}` }), {
                status: 502,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Capture session ID
        const sessionId = initRes.headers.get('mcp-session-id');
        if (sessionId) {
            mcpHeaders['mcp-session-id'] = sessionId;
        }

        // Parse init response (JSON or SSE)
        const initContentType = initRes.headers.get('content-type') ?? '';
        if (initContentType.includes('text/event-stream')) {
            const sseText = await initRes.text();
            const jsonMatch = /^data: (.+)$/m.exec(sseText);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[1]) as McpJsonRpcResponse;
                if (parsed.error) {
                    return new Response(JSON.stringify({ error: `MCP initialize failed: ${parsed.error.message}` }), {
                        status: 502,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
            }
        } else {
            const initResult = await initRes.json() as McpJsonRpcResponse;
            if (initResult.error) {
                return new Response(JSON.stringify({ error: `MCP initialize failed: ${initResult.error.message}` }), {
                    status: 502,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

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
        const toolsRes = await fetch(body.server_url, {
            method: 'POST',
            headers: mcpHeaders,
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {},
            }),
        });

        if (!toolsRes.ok) {
            return new Response(JSON.stringify({ error: `tools/list failed: HTTP ${toolsRes.status}` }), {
                status: 502,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        let tools: Array<{ name: string; description?: string }> = [];

        const toolsContentType = toolsRes.headers.get('content-type') ?? '';
        if (toolsContentType.includes('text/event-stream')) {
            const sseText = await toolsRes.text();
            const jsonMatch = /^data: (.+)$/m.exec(sseText);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[1]) as McpJsonRpcResponse;
                if (parsed.error) {
                    return new Response(JSON.stringify({ error: `tools/list failed: ${parsed.error.message}` }), {
                        status: 502,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                tools = (parsed.result?.tools ?? []).map((t) => ({
                    name: t.name,
                    description: t.description,
                }));
            }
        } else {
            const toolsResult = await toolsRes.json() as McpJsonRpcResponse;
            if (toolsResult.error) {
                return new Response(JSON.stringify({ error: `tools/list failed: ${toolsResult.error.message}` }), {
                    status: 502,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            tools = (toolsResult.result?.tools ?? []).map((t) => ({
                name: t.name,
                description: t.description,
            }));
        }

        return new Response(JSON.stringify({ tools }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
