// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/hooks/useWorkspace'
import { seedDemoWorkspace, removeDemoWorkspace } from '@/db/demoWorkspace'

/**
 * Hook for managing the demo workspace state.
 * Provides seed/remove mutations and reads the demo_seeded flag from workspace settings.
 */
export function useDemoWorkspace() {
    const { workspace, workspaceId } = useWorkspace()
    const queryClient = useQueryClient()

    const settings = workspace?.settings ?? {}
    const isDemoSeeded = settings.demo_seeded === true
    const isDemoDismissed = settings.demo_dismissed === true

    const seedMutation = useMutation({
        mutationFn: async () => {
            if (!workspaceId) throw new Error('No workspace')
            return seedDemoWorkspace(workspaceId)
        },
        onSuccess: () => {
            // Invalidate all affected queries so UI refreshes
            void queryClient.invalidateQueries({ queryKey: ['workspace'] })
            void queryClient.invalidateQueries({ queryKey: ['agents'] })
            void queryClient.invalidateQueries({ queryKey: ['teams'] })
            void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
        },
    })

    const removeMutation = useMutation({
        mutationFn: async () => {
            if (!workspaceId) throw new Error('No workspace')
            return removeDemoWorkspace(workspaceId)
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['workspace'] })
            void queryClient.invalidateQueries({ queryKey: ['agents'] })
            void queryClient.invalidateQueries({ queryKey: ['teams'] })
            void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
        },
    })

    return {
        isDemoSeeded,
        isDemoDismissed,
        seedDemo: seedMutation.mutateAsync,
        removeDemo: removeMutation.mutateAsync,
        isSeeding: seedMutation.isPending,
        isRemoving: removeMutation.isPending,
        seedError: seedMutation.error,
        removeError: removeMutation.error,
    }
}
