// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'
import { fetchAgents } from '@/db/agents'
import type { Agent } from '@/types'

/**
 * React Query hook for fetching agents in a workspace.
 * - 30s stale time (agents don't change frequently)
 * - Refetches on window focus
 * - Query key: ['agents', workspaceId]
 */
export function useAgents(workspaceId: string | null) {
    const {
        data: agents = [],
        isLoading,
        error,
        refetch,
    } = useQuery<Agent[]>({
        queryKey: ['agents', workspaceId],
        queryFn: () => fetchAgents(workspaceId ?? ''),
        enabled: !!workspaceId,
        staleTime: 30 * 1000, // 30 seconds
        refetchOnWindowFocus: true,
    })

    return { agents, isLoading, error, refetch }
}
