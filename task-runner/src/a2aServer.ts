// SPDX-License-Identifier: AGPL-3.0-or-later
// A2A Protocol Server — exposes CrewForm agents as A2A-compatible endpoints.
// Handles Agent Card discovery and task execution via JSON-RPC.

import type { IncomingMessage, ServerResponse } from 'http';
import { supabase } from './supabase';
import { processTask } from './executor';
import type { Task } from './types';
import crypto from 'crypto';

function uuidv4(): string { return crypto.randomUUID(); }

// ─── A2A Agent Card ────────────────────────────────────────────────────────

interface A2ASkill {
    id: string;
    name: string;
    description: string;
    tags: string[];
}

interface A2AAgentCard {
    name: string;
    description: string;
    version: string;
    supportedInterfaces: Array<{
        url: string;
        protocolBinding: string;
        protocolVersion: string;
    }>;
    provider: { organization: string; url: string };
    capabilities: { streaming: boolean; pushNotifications: boolean };
    defaultInputModes: string[];
    defaultOutputModes: string[];
    skills: A2ASkill[];
}

/** Build an Agent Card from a CrewForm agent record */
function buildAgentCard(
    agent: { id: string; name: string; description: string; tools: string[] },
    baseUrl: string,
): A2AAgentCard {
    const skills: A2ASkill[] = agent.tools.map((t) => ({
        id: t,
        name: t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        description: `Agent capability: ${t}`,
        tags: [t],
    }));

    // Always include a general chat skill
    skills.unshift({
        id: 'chat',
        name: 'General Chat',
        description: agent.description || 'General-purpose AI agent',
        tags: ['chat', 'general'],
    });

    return {
        name: agent.name,
        description: agent.description || `CrewForm agent: ${agent.name}`,
        version: '1.0.0',
        supportedInterfaces: [
            {
                url: `${baseUrl}/a2a/${agent.id}`,
                protocolBinding: 'JSONRPC',
                protocolVersion: '1.0',
            },
        ],
        provider: { organization: 'CrewForm', url: 'https://crewform.tech' },
        capabilities: { streaming: false, pushNotifications: false },
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['text/plain'],
        skills,
    };
}

// ─── A2A Task State Mapping ─────────────────────────────────────────────────

function mapTaskState(crewformStatus: string): string {
    switch (crewformStatus) {
        case 'pending':
        case 'dispatched':
            return 'submitted';
        case 'running':
            return 'working';
        case 'completed':
            return 'completed';
        case 'failed':
            return 'failed';
        case 'cancelled':
            return 'canceled';
        default:
            return 'submitted';
    }
}

// ─── JSON-RPC Types ─────────────────────────────────────────────────────────

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

// ─── Auth Helper ────────────────────────────────────────────────────────────

/** Authenticate via Authorization header — expects "Bearer <workspace_api_key>" */
async function authenticateRequest(
    req: IncomingMessage,
): Promise<{ workspaceId: string } | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);

    // Look up workspace by API key (check api_keys table for a "a2a" provider key)
    // For simplicity, we'll use the Supabase service key to validate
    const { data } = await supabase
        .from('api_keys')
        .select('workspace_id')
        .eq('provider', 'a2a')
        .eq('encrypted_key', token)
        .single();

    if (!data) return null;
    return { workspaceId: data.workspace_id as string };
}

// ─── Request Handler ────────────────────────────────────────────────────────

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

/**
 * Handle A2A protocol requests.
 * Routes:
 *   GET  /.well-known/agent.json?agent_id=xxx — Agent Card discovery
 *   POST /a2a/:agentId                        — JSON-RPC endpoint
 *
 * Returns true if the request was handled, false if not an A2A route.
 */
export async function handleA2ARequest(
    req: IncomingMessage,
    res: ServerResponse,
): Promise<boolean> {
    const url = req.url ?? '';

    // CORS preflight
    if (req.method === 'OPTIONS' && (url.startsWith('/a2a/') || url.startsWith('/.well-known/agent.json'))) {
        sendJson(res, 204, '');
        return true;
    }

    // ── Agent Card Discovery ────────────────────────────────────────────
    if (req.method === 'GET' && url.startsWith('/.well-known/agent.json')) {
        const parsedUrl = new URL(url, `http://${req.headers.host ?? 'localhost'}`);
        const agentId = parsedUrl.searchParams.get('agent_id');

        if (!agentId) {
            sendJson(res, 400, { error: 'agent_id query parameter required' });
            return true;
        }

        const { data: agent } = await supabase
            .from('agents')
            .select('id, name, description, tools')
            .eq('id', agentId)
            .single();

        if (!agent) {
            sendJson(res, 404, { error: 'Agent not found' });
            return true;
        }

        const baseUrl = `${req.headers['x-forwarded-proto'] ?? 'http'}://${req.headers.host ?? 'localhost'}`;
        const card = buildAgentCard(
            agent as { id: string; name: string; description: string; tools: string[] },
            baseUrl,
        );
        sendJson(res, 200, card);
        return true;
    }

    // ── JSON-RPC Endpoint ───────────────────────────────────────────────
    if (req.method === 'POST' && url.startsWith('/a2a/')) {
        const agentId = url.replace('/a2a/', '').split('?')[0];

        // Authenticate
        const auth = await authenticateRequest(req);
        if (!auth) {
            sendJson(res, 401, {
                jsonrpc: '2.0',
                id: null,
                error: { code: -32000, message: 'Unauthorized — provide Bearer token in Authorization header' },
            });
            return true;
        }

        // Parse JSON-RPC request
        let rpcReq: JsonRpcRequest;
        try {
            const body = await readBody(req);
            rpcReq = JSON.parse(body) as JsonRpcRequest;
        } catch {
            sendJson(res, 400, {
                jsonrpc: '2.0',
                id: null,
                error: { code: -32700, message: 'Parse error' },
            });
            return true;
        }

        // Verify agent belongs to workspace
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name, description, tools, workspace_id')
            .eq('id', agentId)
            .eq('workspace_id', auth.workspaceId)
            .single();

        if (!agent) {
            const rpcRes: JsonRpcResponse = {
                jsonrpc: '2.0',
                id: rpcReq.id,
                error: { code: -32001, message: 'Agent not found in workspace' },
            };
            sendJson(res, 404, rpcRes);
            return true;
        }

        // Route by method
        const response = await handleJsonRpcMethod(rpcReq, agent as {
            id: string; name: string; description: string; tools: string[]; workspace_id: string;
        }, auth.workspaceId);
        sendJson(res, 200, response);
        return true;
    }

    return false;
}

// ─── JSON-RPC Method Router ─────────────────────────────────────────────────

async function handleJsonRpcMethod(
    rpcReq: JsonRpcRequest,
    agent: { id: string; name: string; description: string; tools: string[]; workspace_id: string },
    workspaceId: string,
): Promise<JsonRpcResponse> {
    switch (rpcReq.method) {
        case 'message/send':
            return handleSendMessage(rpcReq, agent, workspaceId);

        case 'tasks/get':
            return handleGetTask(rpcReq);

        case 'tasks/cancel':
            return handleCancelTask(rpcReq);

        default:
            return {
                jsonrpc: '2.0',
                id: rpcReq.id,
                error: { code: -32601, message: `Method not found: ${rpcReq.method}` },
            };
    }
}

// ─── message/send ───────────────────────────────────────────────────────────

async function handleSendMessage(
    rpcReq: JsonRpcRequest,
    agent: { id: string; workspace_id: string },
    workspaceId: string,
): Promise<JsonRpcResponse> {
    const params = rpcReq.params ?? {};
    const message = params.message as { parts?: Array<{ text?: string }> } | undefined;

    // Extract text from parts
    const textParts = message?.parts?.filter(p => p.text).map(p => p.text) ?? [];
    const inputText = textParts.join('\n') || 'No input provided';

    // Create a CrewForm task
    const taskId = uuidv4();
    const { error: insertError } = await supabase
        .from('tasks')
        .insert({
            id: taskId,
            workspace_id: workspaceId,
            title: `A2A: ${inputText.substring(0, 100)}`,
            description: inputText,
            status: 'dispatched',
            priority: 'medium',
            assigned_agent_id: agent.id,
            created_by: '00000000-0000-0000-0000-000000000000', // system user for A2A
            metadata: { source: 'a2a', a2a_request_id: rpcReq.id },
        });

    if (insertError) {
        return {
            jsonrpc: '2.0',
            id: rpcReq.id,
            error: { code: -32000, message: `Failed to create task: ${insertError.message}` },
        };
    }

    // Log the interaction
    void supabase.from('a2a_task_log').insert({
        workspace_id: workspaceId,
        direction: 'inbound',
        a2a_task_id: taskId,
        local_agent_id: agent.id,
        status: 'submitted',
        input_message: message ?? {},
    });

    // Wait for task completion (poll with timeout)
    const result = await waitForTaskCompletion(taskId, 120_000);

    // Update log
    void supabase
        .from('a2a_task_log')
        .update({
            status: result.status,
            output_artifacts: result.artifacts,
        })
        .eq('a2a_task_id', taskId);

    return {
        jsonrpc: '2.0',
        id: rpcReq.id,
        result: {
            id: taskId,
            contextId: taskId,
            status: {
                state: mapTaskState(result.status),
                timestamp: new Date().toISOString(),
            },
            artifacts: result.artifacts,
        },
    };
}

/** Poll for task completion with timeout */
async function waitForTaskCompletion(
    taskId: string,
    timeoutMs: number,
): Promise<{ status: string; artifacts: unknown[] }> {
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
            return {
                status: 'completed',
                artifacts: [{
                    artifactId: uuidv4(),
                    parts: [{ text: task.result ?? '' }],
                }],
            };
        }

        if (task.status === 'failed') {
            return {
                status: 'failed',
                artifacts: [{
                    artifactId: uuidv4(),
                    parts: [{ text: task.error ?? 'Task failed' }],
                }],
            };
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return {
        status: 'failed',
        artifacts: [{ artifactId: uuidv4(), parts: [{ text: 'Task timed out' }] }],
    };
}

// ─── tasks/get ──────────────────────────────────────────────────────────────

async function handleGetTask(rpcReq: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = rpcReq.params ?? {};
    const taskId = params.id as string | undefined;

    if (!taskId) {
        return {
            jsonrpc: '2.0',
            id: rpcReq.id,
            error: { code: -32602, message: 'Missing required parameter: id' },
        };
    }

    const { data } = await supabase
        .from('tasks')
        .select('id, status, result, error')
        .eq('id', taskId)
        .single();

    if (!data) {
        return {
            jsonrpc: '2.0',
            id: rpcReq.id,
            error: { code: -32001, message: 'Task not found' },
        };
    }

    const task = data as { id: string; status: string; result: string | null; error: string | null };

    return {
        jsonrpc: '2.0',
        id: rpcReq.id,
        result: {
            id: task.id,
            status: {
                state: mapTaskState(task.status),
                timestamp: new Date().toISOString(),
            },
            artifacts: task.result
                ? [{ artifactId: uuidv4(), parts: [{ text: task.result }] }]
                : [],
        },
    };
}

// ─── tasks/cancel ───────────────────────────────────────────────────────────

async function handleCancelTask(rpcReq: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = rpcReq.params ?? {};
    const taskId = params.id as string | undefined;

    if (!taskId) {
        return {
            jsonrpc: '2.0',
            id: rpcReq.id,
            error: { code: -32602, message: 'Missing required parameter: id' },
        };
    }

    const { error } = await supabase
        .from('tasks')
        .update({ status: 'cancelled' })
        .eq('id', taskId)
        .in('status', ['pending', 'dispatched', 'running']);

    if (error) {
        return {
            jsonrpc: '2.0',
            id: rpcReq.id,
            error: { code: -32000, message: error.message },
        };
    }

    return {
        jsonrpc: '2.0',
        id: rpcReq.id,
        result: {
            id: taskId,
            status: { state: 'canceled', timestamp: new Date().toISOString() },
        },
    };
}
