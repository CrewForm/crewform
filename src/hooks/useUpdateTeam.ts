// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateTeam } from '@/db/teams'
import type { Team } from '@/types'

interface UpdateTeamInput {
    id: string
    updates: Partial<Pick<Team, 'name' | 'description' | 'config' | 'mode' | 'output_route_ids' | 'draft_config'>>
}

/**
 * React Query mutation for updating a team.
 */
export function useUpdateTeam() {
    const queryClient = useQueryClient()

    return useMutation<Team, Error, UpdateTeamInput>({
        mutationFn: ({ id, updates }) => updateTeam(id, updates),
        onSuccess: (updated) => {
            void queryClient.invalidateQueries({ queryKey: ['team', updated.id] })
            void queryClient.invalidateQueries({ queryKey: ['teams', updated.workspace_id] })
        },
    })
}

/**
 * Save a draft config (canvas autosave — non-destructive).
 */
export function useSaveDraft() {
    const queryClient = useQueryClient()

    return useMutation<Team, Error, { teamId: string; draftConfig: Team['config'] }>({
        mutationFn: ({ teamId, draftConfig }) =>
            updateTeam(teamId, { draft_config: draftConfig }),
        onSuccess: (updated) => {
            void queryClient.invalidateQueries({ queryKey: ['team', updated.id] })
        },
    })
}

/**
 * Publish draft → copies draft_config to config and clears draft_config.
 */
export function usePublishDraft() {
    const queryClient = useQueryClient()

    return useMutation<Team, Error, { teamId: string; draftConfig: Team['config'] }>({
        mutationFn: ({ teamId, draftConfig }) =>
            updateTeam(teamId, { config: draftConfig, draft_config: null }),
        onSuccess: (updated) => {
            void queryClient.invalidateQueries({ queryKey: ['team', updated.id] })
            void queryClient.invalidateQueries({ queryKey: ['teams', updated.workspace_id] })
        },
    })
}
