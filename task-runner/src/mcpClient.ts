/**
 * MCP Client Manager — connects to MCP servers, discovers tools, and executes tool calls.
 *
 * This module manages MCP client lifecycle for each task execution:
 * 1. Connect to configured MCP servers for the workspace
 * 2. Discover available tools (listTools)
 * 3. Execute tool calls during the LLM tool-use loop
 * 4. Disconnect all clients after task completion
 *
 * Supports Streamable HTTP and SSE transports for remote servers,
 * and stdio transport for local/self-hosted servers.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ToolDefinition } from './toolExecutor';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface McpServerConfig {
    id: string;
    name: string;
    url: string;
    transport: 'streamable-http' | 'sse' | 'stdio';
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
    // Return existing connection if available
    const existing = activeConnections.get(server.id);
    if (existing) {
        return existing.client;
    }

    const client = new Client(
        { name: 'crewform-agent', version: '1.0.0' },
        { capabilities: {} },
    );

    let transport;

    switch (server.transport) {
        case 'streamable-http': {
            transport = new StreamableHTTPClientTransport(
                new URL(server.url),
                {
                    requestInit: {
                        headers: server.config.headers ?? {},
                    },
                },
            );
            break;
        }
        case 'sse': {
            transport = new SSEClientTransport(
                new URL(server.url),
                {
                    requestInit: {
                        headers: server.config.headers ?? {},
                    },
                },
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
    console.log(`[MCP] Connected to "${server.name}" (${server.transport})`);

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

    console.log(`[MCP] Discovered ${tools.length} tools from "${server.name}"`);

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
 *
 * @param serverId - The MCP server ID (used to look up the connection)
 * @param toolName - The original MCP tool name (without the mcp_ prefix)
 * @param args - Tool arguments
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

    // MCP tool results can contain multiple content blocks
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

    // For non-text content, return a description
    return `Tool returned ${content.length} content block(s) of type: ${content.map((b) => b.type).join(', ')}`;
}

/**
 * Parse an MCP tool function name (as sent to the LLM) back into serverId + toolName.
 *
 * Format: mcp_<serverIdPrefix>_<toolName>
 * We need the server configs to resolve the prefix back to a full server ID.
 */
export function parseMcpToolName(
    functionName: string,
    servers: McpServerConfig[],
): { serverId: string; toolName: string } | null {
    if (!functionName.startsWith('mcp_')) return null;

    const withoutPrefix = functionName.slice(4); // remove "mcp_"
    // The prefix is the first 8 chars of the server ID (with hyphens removed)
    const serverPrefix = withoutPrefix.slice(0, 8);
    const toolName = withoutPrefix.slice(9); // skip prefix + underscore

    const server = servers.find((s) => s.id.replace(/-/g, '').startsWith(serverPrefix));
    if (!server) return null;

    return { serverId: server.id, toolName };
}

/**
 * Disconnect all active MCP clients. Call this after task execution completes.
 */
export async function disconnectAll(): Promise<void> {
    const disconnects = Array.from(activeConnections.entries()).map(async ([id, conn]) => {
        try {
            await conn.client.close();
            console.log(`[MCP] Disconnected from "${conn.serverName}"`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[MCP] Error disconnecting "${conn.serverName}": ${msg}`);
        }
        activeConnections.delete(id);
    });

    await Promise.allSettled(disconnects);
}
