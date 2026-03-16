// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'
import { fetchWorkspaceByOwner } from '@/db/workspaces'
import { useAuth } from '@/hooks/useAuth'

/**
 * Fetches the first workspace for the current user.
 * In MVP, each user has exactly one workspace (auto-created on signup).
 * This will be expanded to workspace switching in Phase 2.
 */
export function useWorkspace() {
    const { user } = useAuth()

    const { data: workspace, isLoading, error } = useQuery({
        queryKey: ['workspace', user?.id],
        queryFn: () => fetchWorkspaceByOwner(user?.id ?? ''),
        enabled: !!user,
        staleTime: 5 * 60 * 1000, // 5 minutes — workspace rarely changes
    })

    return {
        workspace: workspace ?? null,
        workspaceId: workspace?.id ?? null,
        isSuspended: !!workspace?.suspended_at,
        isLoading,
        error,
    }
}
