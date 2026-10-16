// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchTasks } from '@/db/tasks'
import { supabase } from '@/lib/supabase'
import type { TaskFilters } from '@/db/tasks'
import type { Task } from '@/types'

/**
 * React Query hook for fetching tasks with filters.
 * Includes Supabase Realtime subscription for live status updates.
 */
export function useTasksQuery(workspaceId: string | null, filters?: TaskFilters) {
    const queryClient = useQueryClient()

    const {
        data: tasks,
        isLoading,
        error,
        refetch,
    } = useQuery<Task[]>({
        queryKey: ['tasks', workspaceId, filters],
        queryFn: () => fetchTasks(workspaceId ?? '', filters),
        enabled: !!workspaceId,
        staleTime: 15 * 1000,
    })

    // Subscribe to realtime task changes for this workspace
    useEffect(() => {
        if (!workspaceId) return

        const channel = supabase
            .channel(`tasks:${workspaceId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'tasks',
                    filter: `workspace_id=eq.${workspaceId}`,
                },
                () => {
                    // Invalidate all task queries for this workspace
                    void queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
                },
            )
            .subscribe()

        return () => {
            void supabase.removeChannel(channel)
        }
    }, [workspaceId, queryClient])

    return { tasks: tasks ?? [], isLoading, error, refetch }
}
