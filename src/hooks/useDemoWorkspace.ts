// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/hooks/useWorkspace'
import {
  seedDemoWorkspace,
  removeDemoWorkspace,
  fetchDemoManifest,
  clearLegacyDemoMarker,
} from '@/db/demoWorkspace'

/**
 * Hook for managing the demo workspace state.
 * Provides seed/remove mutations and reads the demo_seeded flag from workspace settings.
 */
export function useDemoWorkspace() {
  const { workspace, workspaceId } = useWorkspace()
  const queryClient = useQueryClient()

  const settings = workspace?.settings ?? {}
  const manifest = useQuery({
    queryKey: ['demo-manifest', workspaceId],
    queryFn: () => fetchDemoManifest(workspaceId ?? ''),
    enabled: !!workspaceId,
  })
  const isDemoSeeded = !!manifest.data || settings.demo_seeded === true
  const isDemoDismissed = settings.demo_dismissed === true
  const demoTeamId = manifest.data
    ? (manifest.data.team?.id ?? null)
    : typeof settings.demo_team_id === 'string'
      ? settings.demo_team_id
      : null

  const seedMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error('No workspace')
      return seedDemoWorkspace(workspaceId)
    },
    onSuccess: () => {
      // Invalidate all affected queries so UI refreshes
      void queryClient.invalidateQueries({ queryKey: ['demo-manifest', workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
      void queryClient.invalidateQueries({ queryKey: ['agents'] })
      void queryClient.invalidateQueries({ queryKey: ['teams'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error('No workspace')
      if (!manifest.data) return clearLegacyDemoMarker(workspaceId)
      return removeDemoWorkspace(workspaceId, manifest.data.seed_id)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['demo-manifest', workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
      void queryClient.invalidateQueries({ queryKey: ['agents'] })
      void queryClient.invalidateQueries({ queryKey: ['teams'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  return {
    isDemoSeeded,
    demoManifest: manifest.data ?? null,
    isLoadingManifest: manifest.isLoading,
    manifestError: manifest.error,
    isDemoDismissed,
    demoTeamId,
    seedDemo: seedMutation.mutateAsync,
    removeDemo: removeMutation.mutateAsync,
    isSeeding: seedMutation.isPending,
    isRemoving: removeMutation.isPending,
    seedError: seedMutation.error,
    removeError: removeMutation.error,
  }
}
