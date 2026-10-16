// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateAgent } from '@/db/agents'
import type { UpdateAgentInput } from '@/db/agents'
import type { Agent } from '@/types'

/**
 * React Query mutation for updating an agent.
 * Invalidates both single-agent and agent-list caches.
 */
export function useUpdateAgent() {
    const queryClient = useQueryClient()

    return useMutation<Agent, Error, { id: string; data: UpdateAgentInput }>({
        mutationFn: ({ id, data }) => updateAgent(id, data),
        onSuccess: (updated) => {
            void queryClient.invalidateQueries({ queryKey: ['agent', updated.id] })
            void queryClient.invalidateQueries({ queryKey: ['agents', updated.workspace_id] })
        },
    })
}
