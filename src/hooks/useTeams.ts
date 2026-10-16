// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'
import { fetchTeams } from '@/db/teams'
import type { Team } from '@/types'

/**
 * React Query hook for fetching teams in a workspace.
 */
export function useTeams(workspaceId: string | null) {
    const {
        data: teams = [],
        isLoading,
        error,
        refetch,
    } = useQuery<Team[]>({
        queryKey: ['teams', workspaceId],
        queryFn: () => fetchTeams(workspaceId ?? ''),
        enabled: !!workspaceId,
        staleTime: 30 * 1000,
        refetchOnWindowFocus: true,
    })

    return { teams, isLoading, error, refetch }
}
