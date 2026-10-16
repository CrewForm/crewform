// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'
import { fetchAgentById } from '@/db/agents'
import type { Agent } from '@/types'

/**
 * React Query hook for fetching a single agent by ID.
 * Query key: ['agent', agentId]
 */
export function useAgent(agentId: string | undefined) {
    const {
        data: agent,
        isLoading,
        error,
    } = useQuery<Agent | null>({
        queryKey: ['agent', agentId],
        queryFn: () => fetchAgentById(agentId ?? ''),
        enabled: !!agentId,
        staleTime: 30 * 1000,
    })

    return { agent: agent ?? null, isLoading, error }
}
