// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createTeam } from '@/db/teams'
import type { CreateTeamInput } from '@/db/teams'
import type { Team } from '@/types'

/**
 * React Query mutation for creating a team.
 */
export function useCreateTeam() {
    const queryClient = useQueryClient()

    return useMutation<Team, Error, CreateTeamInput>({
        mutationFn: createTeam,
        onSuccess: (created) => {
            void queryClient.invalidateQueries({ queryKey: ['teams', created.workspace_id] })
        },
    })
}
