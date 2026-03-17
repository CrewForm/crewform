// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Workspace } from '@/types'

const ACTIVE_WS_KEY = 'crewform:activeWorkspaceId'

/**
 * Fetches the active workspace for the current user.
 * Supports multi-workspace: checks localStorage for a selected workspace,
 * validates the user is a member, then falls back to their owned workspace.
 */
export function useWorkspace() {
    const { user } = useAuth()
    const queryClient = useQueryClient()

    const { data: workspace, isLoading, error } = useQuery({
        queryKey: ['workspace', user?.id],
        queryFn: async () => {
            if (!user) return null

            // 1. Check if there's a saved active workspace
            const savedId = localStorage.getItem(ACTIVE_WS_KEY)
            if (savedId) {
                // Verify user is a member or owner
                const wsResult = await supabase
                    .from('workspaces')
                    .select('*')
                    .eq('id', savedId)
                    .single()

                if (wsResult.data) return wsResult.data as Workspace
                // If not accessible, clear the saved ID and fall through
                localStorage.removeItem(ACTIVE_WS_KEY)
            }

            // 2. Fall back to the user's owned workspace
            const ownedResult = await supabase
                .from('workspaces')
                .select('*')
                .eq('owner_id', user.id)
                .order('created_at', { ascending: true })
                .limit(1)
                .single()

            if (ownedResult.error && ownedResult.error.code !== 'PGRST116') throw ownedResult.error
            return (ownedResult.data as Workspace | null) ?? null
        },
        enabled: !!user,
        staleTime: 5 * 60 * 1000,
    })

    const setActiveWorkspace = useCallback((workspaceId: string) => {
        localStorage.setItem(ACTIVE_WS_KEY, workspaceId)
        void queryClient.invalidateQueries({ queryKey: ['workspace'] })
    }, [queryClient])

    return {
        workspace: workspace ?? null,
        workspaceId: workspace?.id ?? null,
        isSuspended: !!workspace?.suspended_at,
        isLoading,
        error,
        setActiveWorkspace,
    }
}
