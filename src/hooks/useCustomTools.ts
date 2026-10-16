// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    fetchCustomTools,
    createCustomTool,
    updateCustomTool,
    deleteCustomTool,
} from '@/db/customTools'
import type { CreateCustomToolInput, UpdateCustomToolInput } from '@/db/customTools'

/**
 * React Query hooks for custom tools CRUD.
 */

/** Fetch all custom tools for a workspace */
export function useCustomTools(workspaceId: string | null) {
    const query = useQuery({
        queryKey: ['custom-tools', workspaceId],
        queryFn: () => fetchCustomTools(workspaceId ?? ''),
        enabled: !!workspaceId,
    })

    return {
        customTools: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
    }
}

/** Create a new custom tool */
export function useCreateCustomTool() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: CreateCustomToolInput) => createCustomTool(input),
        onSuccess: (_data, variables) => {
            void qc.invalidateQueries({ queryKey: ['custom-tools', variables.workspace_id] })
        },
    })
}

/** Update an existing custom tool */
export function useUpdateCustomTool() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: UpdateCustomToolInput }) =>
            updateCustomTool(id, input),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['custom-tools'] })
        },
    })
}

/** Delete a custom tool */
export function useDeleteCustomTool() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => deleteCustomTool(id),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['custom-tools'] })
        },
    })
}
