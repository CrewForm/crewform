// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteTask } from '@/db/tasks'

/**
 * React Query mutation for deleting a task.
 */
export function useDeleteTask() {
    const queryClient = useQueryClient()

    return useMutation<undefined, Error, { id: string; workspaceId: string }>({
        mutationFn: async ({ id }) => {
            await deleteTask(id)
            return undefined
        },
        onSuccess: (_data, { workspaceId }) => {
            void queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
        },
    })
}
