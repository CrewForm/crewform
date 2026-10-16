// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateTaskStatus } from '@/db/tasks'
import type { Task, TaskStatus } from '@/types'

/**
 * React Query mutation for cancelling a task.
 */
export function useCancelTask() {
    const queryClient = useQueryClient()

    return useMutation<Task, Error, { id: string; workspaceId: string }>({
        mutationFn: ({ id }) => updateTaskStatus(id, 'cancelled' as TaskStatus),
        onSuccess: (updated) => {
            void queryClient.invalidateQueries({ queryKey: ['task', updated.id] })
            void queryClient.invalidateQueries({ queryKey: ['tasks', updated.workspace_id] })
        },
    })
}
