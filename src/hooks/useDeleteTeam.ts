// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteTeam } from '@/db/teams'

interface DeleteTeamInput {
    id: string
    workspaceId: string
}

/**
 * React Query mutation for deleting a team.
 */
export function useDeleteTeam() {
    const queryClient = useQueryClient()

    return useMutation<undefined, Error, DeleteTeamInput>({
        mutationFn: async ({ id, workspaceId }) => {
            await deleteTeam(id, workspaceId)
            return undefined
        },
        onSuccess: (_data, variables) => {
            void queryClient.invalidateQueries({ queryKey: ['teams', variables.workspaceId] })
        },
    })
}
