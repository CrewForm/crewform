// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'
import { fetchTeamRuns } from '@/db/teamRuns'
import type { TeamRun } from '@/types'

/**
 * React Query hook for fetching all runs for a team.
 */
export function useTeamRuns(teamId: string | null) {
    const {
        data: runs = [],
        isLoading,
        error,
    } = useQuery<TeamRun[]>({
        queryKey: ['team-runs', teamId],
        queryFn: () => fetchTeamRuns(teamId ?? ''),
        enabled: !!teamId,
        staleTime: 10 * 1000,
        refetchOnWindowFocus: true,
    })

    return { runs, isLoading, error }
}
