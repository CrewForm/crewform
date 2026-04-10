// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Hook for re-running a single pipeline step.
 *
 * Calls the task-runner endpoint to re-execute a specific step
 * using the output of the previous step as input.
 * Only applicable to pipeline mode.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'

interface RerunStepInput {
    runId: string
    teamId: string
    stepIdx: number
}

interface RerunStepResult {
    success: boolean
    message?: string
}

/**
 * Re-run a single pipeline step.
 *
 * The task-runner will:
 * 1. Fetch the previous step's output from team_messages
 * 2. Re-execute the agent at stepIdx with that input
 * 3. Write new messages for the re-run
 * 4. Reset downstream steps to pending
 */
export function useRerunStep() {
    const queryClient = useQueryClient()

    return useMutation<RerunStepResult, Error, RerunStepInput>({
        mutationFn: async ({ runId, stepIdx }) => {
            const response = await fetch(`/api/team-runs/${runId}/steps/${stepIdx}/rerun`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })

            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as { error?: string }
                throw new Error(body.error ?? `Failed to re-run step ${stepIdx}`)
            }

            return response.json() as Promise<RerunStepResult>
        },
        onSuccess: (_data, variables) => {
            // Invalidate the team run and messages queries
            void queryClient.invalidateQueries({ queryKey: ['team-run', variables.runId] })
            void queryClient.invalidateQueries({ queryKey: ['team-messages', variables.runId] })
            void queryClient.invalidateQueries({ queryKey: ['team', variables.teamId] })
        },
    })
}
