// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'
import { fetchTeam } from '@/db/teams'
import { fetchTeamMembers } from '@/db/teams'
import type { Team, TeamMember } from '@/types'

/**
 * React Query hook for fetching a single team with its members.
 */
export function useTeam(teamId: string | null) {
    const {
        data: team,
        isLoading: isLoadingTeam,
        error: teamError,
    } = useQuery<Team>({
        queryKey: ['team', teamId],
        queryFn: () => fetchTeam(teamId ?? ''),
        enabled: !!teamId,
        staleTime: 10 * 1000,
    })

    const {
        data: members = [],
        isLoading: isLoadingMembers,
        error: membersError,
    } = useQuery<TeamMember[]>({
        queryKey: ['team-members', teamId],
        queryFn: () => fetchTeamMembers(teamId ?? ''),
        enabled: !!teamId,
        staleTime: 10 * 1000,
    })

    return {
        team,
        members,
        isLoading: isLoadingTeam || isLoadingMembers,
        error: teamError || membersError,
    }
}
