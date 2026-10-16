// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createAgent } from '@/db/agents'
import type { CreateAgentInput } from '@/db/agents'
import type { Agent } from '@/types'

/**
 * React Query mutation for creating a new agent.
 * Invalidates the agents query cache on success.
 */
export function useCreateAgent() {
    const queryClient = useQueryClient()

    return useMutation<Agent, Error, CreateAgentInput>({
        mutationFn: createAgent,
        onSuccess: (newAgent) => {
            // Invalidate agents list to refetch with the new agent
            void queryClient.invalidateQueries({ queryKey: ['agents', newAgent.workspace_id] })
        },
    })
}
