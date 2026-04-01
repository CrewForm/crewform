// SPDX-License-Identifier: AGPL-3.0-or-later
// MCP Server — exposes CrewForm agents as MCP tools via Streamable HTTP.
// External clients (Claude Desktop, Cursor, other agents) connect here
// and can call CrewForm agents as if they were MCP tools.

import type { IncomingMessage, ServerResponse } from 'http';
import { supabase } from './supabase';
import { processTask } from './executor';
import type { Task } from './types';
import crypto from 'crypto';

function uuidv4(): string { return crypto.randomUUID(); }

// ─── Types ──────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, { type: string; description: string }>;
        required: string[];
    };
}

// ─── Auth ───────────────────────────────────────────────────────────────────

async function authenticateRequest(
    req: IncomingMessage,
): Promise<{ workspaceId: string } | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);

    // Check for a dedicated MCP server key
    const { data } = await supabase
        .from('api_keys')
        .select('workspace_id')
        .eq('provider', 'mcp-server')
        .eq('encrypted_key', token)
        .single();

    if (data) return { workspaceId: data.workspace_id as string };

    // Fall back to A2A key (same workspace auth pattern)
    const { data: a2aData } = await supabase
        .from('api_keys')
        .select('workspace_id')
        .eq('provider', 'a2a')
        .eq('encrypted_key', token)
        .single();

    if (a2aData) return { workspaceId: a2aData.workspace_id as string };

    return null;
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

function sendJsonRpc(res: ServerResponse, id: string | number | null, result?: unknown, error?: { code: number; message: string }) {
    const rpcRes: JsonRpcResponse = { jsonrpc: '2.0', id };
    if (error) rpcRes.error = error;
    else rpcRes.result = result;
    sendJson(res, 200, rpcRes);
}

// ─── Agent → MCP Tool Mapping ───────────────────────────────────────────────

function agentToMcpTool(agent: {
    id: string; name: string; description: string; tools: string[];
}): McpToolDefinition {
    const toolName = agent.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 64);

    const toolsList = (agent.tools ?? []).length > 0
        ? ` Capabilities: ${agent.tools.join(', ')}.`
        : '';

    return {
        name: toolName,
        description: `${agent.description || agent.name}${toolsList}`,
        inputSchema: {
            type: 'object',
            properties: {
                task: {
                    type: 'string',
                    description: 'The task or question to send to this agent',
                },
                context: {
                    type: 'string',
                    description: 'Optional additional context for the agent',
                },
            },
            required: ['task'],
        },
    };
}

// ─── Tool Execution ─────────────────────────────────────────────────────────

/** Execute a CrewForm agent as an MCP tool call */
async function executeAgentTool(
    agentId: string,
    workspaceId: string,
    args: { task?: string; context?: string },
): Promise<string> {
    const taskInput = args.task ?? 'No input provided';
    const contextSuffix = args.context ? `\n\nAdditional context:\n${args.context}` : '';

    // Create a task record for audit trail
    const taskId = uuidv4();
    const { error: insertError } = await supabase
        .from('tasks')
        .insert({
            id: taskId,
            workspace_id: workspaceId,
            title: `MCP: ${taskInput.substring(0, 100)}`,
            description: `${taskInput}${contextSuffix}`,
            status: 'dispatched',
            priority: 'medium',
            assigned_agent_id: agentId,
            created_by: '00000000-0000-0000-0000-000000000000', // system user for MCP
            metadata: { source: 'mcp-server' },
        });

    if (insertError) {
        throw new Error(`Failed to create task: ${insertError.message}`);
    }

    // Wait for task completion (poll with timeout)
    const result = await waitForTaskCompletion(taskId, 120_000);
    return result;
}

/** Poll for task completion with timeout */
async function waitForTaskCompletion(
    taskId: string,
    timeoutMs: number,
): Promise<string> {
    const start = Date.now();
    const pollInterval = 2000;

    while (Date.now() - start < timeoutMs) {
        const { data } = await supabase
            .from('tasks')
            .select('status, result, error')
            .eq('id', taskId)
            .single();

        if (!data) break;

        const task = data as { status: string; result: string | null; error: string | null };

        if (task.status === 'completed') {
            return task.result ?? '(no output)';
        }

        if (task.status === 'failed') {
            throw new Error(task.error ?? 'Task failed');
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Task timed out after 120 seconds');
}

// ─── JSON-RPC Method Handlers ───────────────────────────────────────────────

async function handleInitialize(
    _rpcReq: JsonRpcRequest,
    res: ServerResponse,
) {
    sendJsonRpc(res, _rpcReq.id, {
        protocolVersion: '2024-11-05',
        capabilities: {
            tools: {},
        },
        serverInfo: {
            name: 'crewform',
            version: '1.0.0',
        },
    });
}

async function handleToolsList(
    rpcReq: JsonRpcRequest,
    res: ServerResponse,
    workspaceId: string,
) {
    // Fetch all MCP-published agents for this workspace
    const { data: agents, error } = await supabase
        .from('agents')
        .select('id, name, description, tools')
        .eq('workspace_id', workspaceId)
        .eq('is_mcp_published', true);

    if (error) {
        sendJsonRpc(res, rpcReq.id, undefined, { code: -32000, message: error.message });
        return;
    }

    const tools = (agents as Array<{ id: string; name: string; description: string; tools: string[] }>)
        .map(agent => agentToMcpTool(agent));

    sendJsonRpc(res, rpcReq.id, { tools });
}

async function handleToolsCall(
    rpcReq: JsonRpcRequest,
    res: ServerResponse,
    workspaceId: string,
) {
    const params = rpcReq.params ?? {};
    const toolName = params.name as string | undefined;
    const args = (params.arguments ?? {}) as { task?: string; context?: string };

    if (!toolName) {
        sendJsonRpc(res, rpcReq.id, undefined, { code: -32602, message: 'Missing required parameter: name' });
        return;
    }

    // Find agent by matching tool name
    const { data: agents } = await supabase
        .from('agents')
        .select('id, name, description, tools')
        .eq('workspace_id', workspaceId)
        .eq('is_mcp_published', true);

    const agentList = (agents ?? []) as Array<{ id: string; name: string; description: string; tools: string[] }>;
    const matchedAgent = agentList.find(a => agentToMcpTool(a).name === toolName);

    if (!matchedAgent) {
        sendJsonRpc(res, rpcReq.id, undefined, {
            code: -32602,
            message: `Tool "${toolName}" not found. Available: ${agentList.map(a => agentToMcpTool(a).name).join(', ')}`,
        });
        return;
    }

    try {
        console.log(`[MCP Server] Executing tool "${toolName}" → agent "${matchedAgent.name}" (${matchedAgent.id})`);
        const result = await executeAgentTool(matchedAgent.id, workspaceId, args);

        sendJsonRpc(res, rpcReq.id, {
            content: [{ type: 'text', text: result }],
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[MCP Server] Tool execution error: ${msg}`);
        sendJsonRpc(res, rpcReq.id, {
            content: [{ type: 'text', text: `Error: ${msg}` }],
            isError: true,
        });
    }
}

// ─── Main Request Handler ───────────────────────────────────────────────────

/**
 * Handle MCP protocol requests.
 * Routes:
 *   POST /mcp       — MCP JSON-RPC endpoint (Streamable HTTP transport)
 *   GET  /mcp       — Server info
 *   OPTIONS /mcp    — CORS preflight
 *
 * Returns true if the request was handled, false otherwise.
 */
export async function handleMcpServerRequest(
    req: IncomingMessage,
    res: ServerResponse,
): Promise<boolean> {
    const url = req.url ?? '';

    if (!url.startsWith('/mcp')) return false;

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

    // GET /mcp — Server info / health
    if (req.method === 'GET' && url === '/mcp') {
        sendJson(res, 200, {
            status: 'ok',
            protocol: 'mcp',
            transport: 'streamable-http',
            version: '2024-11-05',
            server: 'crewform',
        });
        return true;
    }

    // POST /mcp — JSON-RPC endpoint
    if (req.method === 'POST' && url === '/mcp') {
        // Parse JSON-RPC
        let rpcReq: JsonRpcRequest;
        try {
            const body = await readBody(req);
            rpcReq = JSON.parse(body) as JsonRpcRequest;
        } catch {
            sendJsonRpc(res, null, undefined, { code: -32700, message: 'Parse error' });
            return true;
        }

        // Handle initialize (no auth required per spec)
        if (rpcReq.method === 'initialize') {
            await handleInitialize(rpcReq, res);
            return true;
        }

        // Handle notifications (no response needed)
        if (rpcReq.method === 'notifications/initialized') {
            res.writeHead(204);
            res.end();
            return true;
        }

        // All other methods require auth
        const auth = await authenticateRequest(req);
        if (!auth) {
            sendJsonRpc(res, rpcReq.id, undefined, {
                code: -32000,
                message: 'Unauthorized — provide Bearer token in Authorization header',
            });
            return true;
        }

        // Route by method
        switch (rpcReq.method) {
            case 'tools/list':
                await handleToolsList(rpcReq, res, auth.workspaceId);
                break;

            case 'tools/call':
                await handleToolsCall(rpcReq, res, auth.workspaceId);
                break;

            case 'ping':
                sendJsonRpc(res, rpcReq.id, {});
                break;

            default:
                sendJsonRpc(res, rpcReq.id, undefined, {
                    code: -32601,
                    message: `Method not found: ${rpcReq.method}`,
                });
        }

        return true;
    }

    return false;
}
