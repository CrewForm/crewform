// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    fetchMcpServers,
    createMcpServer,
    updateMcpServer,
    deleteMcpServer,
} from '@/db/mcpServers'
import type { CreateMcpServerInput, UpdateMcpServerInput } from '@/db/mcpServers'

/** Fetch all MCP servers for a workspace */
export function useMcpServers(workspaceId: string | null) {
    const query = useQuery({
        queryKey: ['mcp-servers', workspaceId],
        queryFn: () => fetchMcpServers(workspaceId ?? ''),
        enabled: !!workspaceId,
    })

    return {
        mcpServers: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
    }
}

/** Create a new MCP server */
export function useCreateMcpServer() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: CreateMcpServerInput) => createMcpServer(input),
        onSuccess: (_data, variables) => {
            void qc.invalidateQueries({ queryKey: ['mcp-servers', variables.workspace_id] })
        },
    })
}

/** Update an MCP server */
export function useUpdateMcpServer() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: UpdateMcpServerInput }) =>
            updateMcpServer(id, input),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['mcp-servers'] })
        },
    })
}

/** Delete an MCP server */
export function useDeleteMcpServer() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => deleteMcpServer(id),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['mcp-servers'] })
        },
    })
}
