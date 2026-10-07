// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { rerunTeamRun } from '@/db/teamRuns'
import type { TeamRun } from '@/types'

/**
 * React Query mutation for re-running a failed/completed/cancelled team run.
 * Creates a new run, preserving prior results and reserving its allowance.
 */
export function useRerunTeamRun() {
    const queryClient = useQueryClient()

    return useMutation<TeamRun, Error, { runId: string; teamId: string }>({
        mutationFn: ({ runId }) => rerunTeamRun(runId),
        onSuccess: (_, { teamId }) => {
            void queryClient.invalidateQueries({ queryKey: ['teamRuns', teamId] })
            void queryClient.invalidateQueries({ queryKey: ['teamRun'] })
        },
    })
}
