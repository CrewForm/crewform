// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'

export interface McpServer {
    id: string
    workspace_id: string
    name: string
    description: string
    url: string
    transport: 'streamable-http' | 'sse' | 'stdio'
    config: Record<string, unknown>
    is_enabled: boolean
    tools_cache: Array<{ name: string; description?: string }>
    created_at: string
    updated_at: string
}

export interface CreateMcpServerInput {
    workspace_id: string
    name: string
    description?: string
    url: string
    transport: 'streamable-http' | 'sse' | 'stdio'
    config?: Record<string, unknown>
}

export interface UpdateMcpServerInput {
    name?: string
    description?: string
    url?: string
    transport?: 'streamable-http' | 'sse' | 'stdio'
    config?: Record<string, unknown>
    is_enabled?: boolean
    tools_cache?: Array<{ name: string; description?: string }>
}

/** Fetch all MCP servers for a workspace */
export async function fetchMcpServers(workspaceId: string): Promise<McpServer[]> {
    const { data, error } = await supabase
        .from('mcp_servers')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true })

    if (error) throw error
    return data as McpServer[]
}

/** Create a new MCP server */
export async function createMcpServer(input: CreateMcpServerInput): Promise<McpServer> {
    const result = await supabase
        .from('mcp_servers')
        .insert(input)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as unknown as McpServer
}

/** Update an MCP server */
export async function updateMcpServer(id: string, input: UpdateMcpServerInput): Promise<McpServer> {
    const result = await supabase
        .from('mcp_servers')
        .update(input)
        .eq('id', id)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as unknown as McpServer
}

/** Delete an MCP server */
export async function deleteMcpServer(id: string): Promise<void> {
    const { error } = await supabase
        .from('mcp_servers')
        .delete()
        .eq('id', id)

    if (error) throw error
}

// ─── MCP Tool Discovery (via Edge Function proxy) ───────────────────────────

/**
 * Discover tools from an MCP server via the mcp-discover Edge Function.
 * The Edge Function proxies JSON-RPC calls server-side to bypass CORS.
 * Saves discovered tools to tools_cache in the database.
 */
export async function discoverMcpTools(
    server: McpServer,
): Promise<Array<{ name: string; description?: string }>> {
    const configHeaders = server.config.headers as Record<string, string> | undefined

    const result = await supabase.functions.invoke('mcp-discover', {
        body: {
            server_url: server.url,
            server_headers: configHeaders,
        },
    })

    if (result.error) {
        const errObj = result.error as { message?: string }
        throw new Error(errObj.message ?? 'Discovery request failed')
    }

    const response = result.data as { tools?: Array<{ name: string; description?: string }>; error?: string }

    if (response.error) {
        throw new Error(response.error)
    }

    const tools = response.tools ?? []

    // Save to tools_cache
    await updateMcpServer(server.id, { tools_cache: tools })

    return tools
}

