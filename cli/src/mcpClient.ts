// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// mcpClient.ts — MCP client for CLI use.
// Adapted from task-runner/src/mcpClient.ts — standalone, no Supabase dependency.
// Supports Streamable HTTP, SSE, and stdio transports.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ToolDefinition } from './tools.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface McpServerConfig {
    /** Unique identifier for this server instance */
    id: string;
    /** Human-friendly name */
    name: string;
    /** URL (for http/sse) or command (for stdio) */
    url: string;
    /** Transport mechanism */
    transport: 'streamable-http' | 'sse' | 'stdio';
    /** Extra configuration */
    config: {
        headers?: Record<string, string>;
        env?: Record<string, string>;
        command?: string;
        args?: string[];
    };
}

interface McpConnection {
    client: Client;
    serverId: string;
    serverName: string;
}

// ─── Connection Pool ─────────────────────────────────────────────────────────

const activeConnections = new Map<string, McpConnection>();

/**
 * Connect to an MCP server and cache the connection.
 */
export async function connectToServer(server: McpServerConfig): Promise<Client> {
    const existing = activeConnections.get(server.id);
    if (existing) return existing.client;

    const client = new Client(
        { name: 'crewform-cli', version: '0.1.0' },
        { capabilities: {} },
    );

    let transport;

    switch (server.transport) {
        case 'streamable-http': {
            transport = new StreamableHTTPClientTransport(
                new URL(server.url),
                { requestInit: { headers: server.config.headers ?? {} } },
            );
            break;
        }
        case 'sse': {
            transport = new SSEClientTransport(
                new URL(server.url),
                { requestInit: { headers: server.config.headers ?? {} } },
            );
            break;
        }
        case 'stdio': {
            const command = server.config.command ?? server.url;
            transport = new StdioClientTransport({
                command,
                args: server.config.args ?? [],
                env: {
                    ...process.env,
                    ...(server.config.env ?? {}),
                } as Record<string, string>,
            });
            break;
        }
        default:
            throw new Error(`Unsupported MCP transport: ${server.transport}`);
    }

    await client.connect(transport);

    activeConnections.set(server.id, {
        client,
        serverId: server.id,
        serverName: server.name,
    });

    return client;
}

/**
 * Discover tools from an MCP server. Returns OpenAI-compatible tool definitions.
 */
export async function discoverTools(server: McpServerConfig): Promise<{
    definitions: ToolDefinition[];
    rawTools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
}> {
    const client = await connectToServer(server);
    const result = await client.listTools();
    const tools = result.tools ?? [];

    // Convert MCP tool schema to OpenAI-compatible format
    const definitions: ToolDefinition[] = tools.map((tool) => {
        const schema = (tool.inputSchema ?? { type: 'object', properties: {}, required: [] }) as {
            type: string;
            properties?: Record<string, { type: string; description?: string }>;
            required?: string[];
        };

        return {
            type: 'function' as const,
            function: {
                name: `mcp_${server.id.replace(/-/g, '').slice(0, 8)}_${tool.name}`,
                description: `[${server.name}] ${tool.description ?? tool.name}`,
                parameters: {
                    type: 'object',
                    properties: Object.fromEntries(
                        Object.entries(schema.properties ?? {}).map(([key, val]) => [
                            key,
                            { type: val.type ?? 'string', description: val.description ?? key },
                        ]),
                    ),
                    required: schema.required ?? [],
                },
            },
        };
    });

    return {
        definitions,
        rawTools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
        })),
    };
}

/**
 * Call a tool on an MCP server.
 */
export async function callMcpTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
): Promise<string> {
    const connection = activeConnections.get(serverId);
    if (!connection) {
        throw new Error(`MCP server "${serverId}" is not connected`);
    }

    const result = await connection.client.callTool({
        name: toolName,
        arguments: args,
    });

    const content = result.content;
    if (!Array.isArray(content) || content.length === 0) {
        return result.isError ? 'Error: Tool returned an error with no content' : '(no output)';
    }

    // Concatenate text content blocks
    const textParts = content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text);

    if (textParts.length > 0) {
        const combined = textParts.join('\n');
        return combined.length > 8000 ? combined.slice(0, 8000) + '\n... (truncated)' : combined;
    }

    return `Tool returned ${content.length} content block(s) of type: ${content.map((b) => b.type).join(', ')}`;
}

/**
 * Parse an MCP tool function name back into serverId + toolName.
 * Format: mcp_<serverIdPrefix>_<toolName>
 */
export function parseMcpToolName(
    functionName: string,
    servers: McpServerConfig[],
): { serverId: string; toolName: string } | null {
    if (!functionName.startsWith('mcp_')) return null;

    const withoutPrefix = functionName.slice(4);
    const serverPrefix = withoutPrefix.slice(0, 8);
    const toolName = withoutPrefix.slice(9);

    const server = servers.find((s) => s.id.replace(/-/g, '').startsWith(serverPrefix));
    if (!server) return null;

    return { serverId: server.id, toolName };
}

/**
 * Disconnect all active MCP clients. Call this after execution completes.
 */
export async function disconnectAll(): Promise<void> {
    const disconnects = Array.from(activeConnections.entries()).map(async ([id, conn]) => {
        try {
            await conn.client.close();
        } catch {
            // best-effort
        }
        activeConnections.delete(id);
    });

    await Promise.allSettled(disconnects);
}

/**
 * Parse MCP server configs from a JSON config file section.
 */
export function parseMcpServers(raw: unknown): McpServerConfig[] {
    if (!Array.isArray(raw)) return [];

    return raw.map((entry, i) => {
        const e = entry as Record<string, unknown>;
        return {
            id: (e.id as string) ?? `mcp-${i}`,
            name: (e.name as string) ?? `MCP Server ${i + 1}`,
            url: (e.url as string) ?? '',
            transport: (e.transport as McpServerConfig['transport']) ?? 'stdio',
            config: (e.config as McpServerConfig['config']) ?? {},
        };
    });
}
