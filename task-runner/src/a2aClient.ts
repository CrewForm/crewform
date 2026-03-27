// SPDX-License-Identifier: AGPL-3.0-or-later
// A2A Protocol Client — sends tasks to external A2A agents.
// Used by the a2a_delegate built-in tool.

import { supabase } from './supabase';
import crypto from 'crypto';

function uuidv4(): string { return crypto.randomUUID(); }

// ─── Types ──────────────────────────────────────────────────────────────────

interface A2AAgentCard {
    name: string;
    description: string;
    version: string;
    supportedInterfaces?: Array<{
        url: string;
        protocolBinding: string;
        protocolVersion: string;
    }>;
    skills?: Array<{
        id: string;
        name: string;
        description: string;
        tags?: string[];
    }>;
    [key: string]: unknown;
}

interface A2ATaskResult {
    id?: string;
    status?: { state: string };
    artifacts?: Array<{
        artifactId?: string;
        parts?: Array<{ text?: string }>;
    }>;
}

// ─── Agent Discovery ────────────────────────────────────────────────────────

/**
 * Discover an external A2A agent by fetching its Agent Card.
 * Tries /.well-known/agent.json (A2A v1.0 convention).
 */
export async function discoverA2AAgent(baseUrl: string): Promise<A2AAgentCard> {
    const cleanUrl = baseUrl.replace(/\/$/, '');

    // Try the well-known path
    const cardUrl = `${cleanUrl}/.well-known/agent.json`;
    const response = await fetch(cardUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Agent Card from ${cardUrl}: ${String(response.status)} ${response.statusText}`);
    }

    const card = (await response.json()) as A2AAgentCard;

    if (!card.name) {
        throw new Error('Invalid Agent Card: missing name');
    }

    return card;
}

/**
 * Register an external A2A agent in the workspace.
 * Fetches and caches the Agent Card.
 */
export async function registerA2AAgent(
    workspaceId: string,
    baseUrl: string,
): Promise<{ id: string; card: A2AAgentCard }> {
    const card = await discoverA2AAgent(baseUrl);

    const { data, error } = await supabase
        .from('a2a_remote_agents')
        .insert({
            workspace_id: workspaceId,
            name: card.name,
            base_url: baseUrl,
            agent_card: card,
        })
        .select()
        .single();

    if (error) throw new Error(`Failed to register agent: ${error.message}`);

    return { id: (data as { id: string }).id, card };
}

// ─── Task Delegation ────────────────────────────────────────────────────────

/**
 * Send a task to an external A2A agent.
 * Uses JSON-RPC message/send over HTTP.
 */
export async function delegateToA2AAgent(
    remoteAgentId: string,
    message: string,
    workspaceId: string,
): Promise<string> {
    // Fetch remote agent info
    const { data: remoteAgent, error: fetchError } = await supabase
        .from('a2a_remote_agents')
        .select('*')
        .eq('id', remoteAgentId)
        .single();

    if (fetchError || !remoteAgent) {
        throw new Error(`Remote A2A agent not found: ${remoteAgentId}`);
    }

    const agent = remoteAgent as {
        id: string;
        base_url: string;
        agent_card: A2AAgentCard;
        is_enabled: boolean;
    };

    if (!agent.is_enabled) {
        throw new Error(`Remote A2A agent is disabled: ${agent.agent_card.name}`);
    }

    // Determine the JSON-RPC endpoint
    const jsonRpcInterface = agent.agent_card.supportedInterfaces?.find(
        (i) => i.protocolBinding === 'JSONRPC',
    );
    const rpcUrl = jsonRpcInterface?.url
        ?? `${agent.base_url.replace(/\/$/, '')}/a2a/jsonrpc`;

    // Build JSON-RPC request
    const requestId = uuidv4();
    const rpcRequest = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'message/send',
        params: {
            message: {
                messageId: uuidv4(),
                role: 'user',
                parts: [{ text: message }],
            },
        },
    };

    // Log the outbound interaction
    const logId = uuidv4();
    void supabase.from('a2a_task_log').insert({
        id: logId,
        workspace_id: workspaceId,
        direction: 'outbound',
        remote_agent_id: remoteAgentId,
        status: 'submitted',
        input_message: rpcRequest.params.message,
    });

    // Send the request
    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(rpcRequest),
        signal: AbortSignal.timeout(120_000), // 2 min timeout
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`A2A request failed (${String(response.status)}): ${errorText}`);
    }

    const rpcResponse = (await response.json()) as {
        result?: A2ATaskResult;
        error?: { code: number; message: string };
    };

    if (rpcResponse.error) {
        void supabase
            .from('a2a_task_log')
            .update({ status: 'failed', output_artifacts: [{ error: rpcResponse.error.message }] })
            .eq('id', logId);
        throw new Error(`A2A agent error: ${rpcResponse.error.message}`);
    }

    // Extract result text from artifacts
    const result = rpcResponse.result;
    const artifacts = result?.artifacts ?? [];
    const outputText = artifacts
        .flatMap((a) => a.parts ?? [])
        .filter((p) => p.text)
        .map((p) => p.text)
        .join('\n');

    const a2aTaskId = result?.id ?? requestId;
    const finalStatus = result?.status?.state ?? 'completed';

    // Update log
    void supabase
        .from('a2a_task_log')
        .update({
            a2a_task_id: a2aTaskId,
            status: finalStatus,
            output_artifacts: artifacts,
        })
        .eq('id', logId);

    return outputText || 'No output from remote agent.';
}
