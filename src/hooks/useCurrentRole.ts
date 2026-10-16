// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/hooks/useWorkspace'
import type { WorkspaceRole } from '@/types'

const ROLE_HIERARCHY: WorkspaceRole[] = ['owner', 'admin', 'manager', 'member', 'viewer']

/**
 * Returns the current user's role in the active workspace.
 * Also provides helper `hasMinRole(minRole)` to check hierarchy.
 */
export function useCurrentRole() {
    const { workspaceId } = useWorkspace()

    const { data: role, isLoading } = useQuery<WorkspaceRole | null>({
        queryKey: ['current-role', workspaceId],
        queryFn: async () => {
            if (!workspaceId) return null
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return null

            const result = await supabase
                .from('workspace_members')
                .select('role')
                .eq('workspace_id', workspaceId)
                .eq('user_id', user.id)
                .single()

            if (result.error) return null
            return (result.data as { role: WorkspaceRole }).role
        },
        enabled: !!workspaceId,
        staleTime: 5 * 60 * 1000, // 5 minutes
    })

    function hasMinRole(minRole: WorkspaceRole): boolean {
        if (!role) return false
        const currentIdx = ROLE_HIERARCHY.indexOf(role)
        const requiredIdx = ROLE_HIERARCHY.indexOf(minRole)
        return currentIdx >= 0 && currentIdx <= requiredIdx
    }

    return { role: role ?? null, isLoading, hasMinRole }
}

/** Check if a role meets the minimum required role */
export function meetsMinRole(userRole: WorkspaceRole | null, minRole: WorkspaceRole): boolean {
    if (!userRole) return false
    const currentIdx = ROLE_HIERARCHY.indexOf(userRole)
    const requiredIdx = ROLE_HIERARCHY.indexOf(minRole)
    return currentIdx >= 0 && currentIdx <= requiredIdx
}
