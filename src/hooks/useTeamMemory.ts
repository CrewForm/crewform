// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchTeamMemories, deleteTeamMemory } from '@/db/teamMemory'
import type { TeamMemoryEntry } from '@/db/teamMemory'

/** Fetch all memories for a team */
export function useTeamMemories(teamId: string | undefined) {
    return useQuery<TeamMemoryEntry[]>({
        queryKey: ['team-memories', teamId],
        queryFn: () => {
            if (!teamId) throw new Error('Missing teamId')
            return fetchTeamMemories(teamId)
        },
        enabled: !!teamId,
    })
}

/** Delete a single team memory entry */
export function useDeleteTeamMemory() {
    const queryClient = useQueryClient()
    return useMutation<undefined, Error, { memoryId: string; teamId: string }>({
        mutationFn: async ({ memoryId }) => {
            await deleteTeamMemory(memoryId)
            return undefined
        },
        onSuccess: (_d, { teamId }) => {
            void queryClient.invalidateQueries({ queryKey: ['team-memories', teamId] })
        },
    })
}
