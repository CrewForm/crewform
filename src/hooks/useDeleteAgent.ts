// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteAgent } from '@/db/agents'

/**
 * React Query mutation for deleting an agent.
 * Invalidates the agent-list cache on success.
 */
export function useDeleteAgent() {
    const queryClient = useQueryClient()

    return useMutation<undefined, Error, { id: string; workspaceId: string }>({
        mutationFn: async ({ id }) => {
            await deleteAgent(id)
            return undefined
        },
        onSuccess: (_data, { workspaceId }) => {
            void queryClient.invalidateQueries({ queryKey: ['agents', workspaceId] })
        },
    })
}
