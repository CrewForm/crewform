// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { rerunTask } from '@/db/tasks'
import type { Task } from '@/types'

/**
 * React Query mutation for re-running a failed/completed/cancelled task.
 * Resets the task to dispatched so the Task Runner picks it up again.
 */
export function useRerunTask() {
    const queryClient = useQueryClient()

    return useMutation<Task, Error, { id: string; workspaceId: string }>({
        mutationFn: ({ id }) => rerunTask(id),
        onSuccess: (_, { workspaceId }) => {
            void queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
            void queryClient.invalidateQueries({ queryKey: ['task'] })
        },
    })
}
