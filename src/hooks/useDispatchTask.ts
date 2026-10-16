// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateTaskStatus } from '@/db/tasks'
import type { Task, TaskStatus } from '@/types'

/**
 * React Query mutation for dispatching a task (pending → dispatched).
 * This triggers the auto-dispatch DB trigger which creates an agent_tasks record,
 * and allows the Task Runner to pick it up.
 */
export function useDispatchTask() {
    const queryClient = useQueryClient()

    return useMutation<Task, Error, { id: string }>({
        mutationFn: ({ id }) => updateTaskStatus(id, 'dispatched' as TaskStatus),
        onSuccess: (dispatched) => {
            void queryClient.invalidateQueries({ queryKey: ['tasks', dispatched.workspace_id] })
        },
    })
}
