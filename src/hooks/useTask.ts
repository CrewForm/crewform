// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Task } from '@/types'

/** Fetch a single task by ID */
async function fetchTaskById(id: string): Promise<Task | null> {
    const result = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .single()

    if (result.error) {
        if (result.error.code === 'PGRST116') return null
        throw result.error
    }
    return result.data as Task
}

/**
 * React Query hook for fetching a single task.
 * Also subscribes to Supabase Realtime to update the cache when the task changes.
 */
export function useTask(taskId: string | null) {
    const queryClient = useQueryClient()

    const { data: task, isLoading, error } = useQuery<Task | null>({
        queryKey: ['task', taskId],
        queryFn: () => fetchTaskById(taskId ?? ''),
        enabled: !!taskId,
        staleTime: 10 * 1000,
    })

    useEffect(() => {
        if (!taskId) return

        // Subscribe to changes to this specific task row
        const channel = supabase
            .channel(`task-${taskId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'tasks',
                    filter: `id=eq.${taskId}`,
                },
                (payload) => {
                    // Update React Query cache directly when an update arrives
                    queryClient.setQueryData(['task', taskId], payload.new as Task)
                }
            )
            .subscribe()

        return () => {
            void supabase.removeChannel(channel)
        }
    }, [taskId, queryClient])

    return { task: task ?? null, isLoading, error }
}
