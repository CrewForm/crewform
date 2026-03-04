// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'
import { fetchEELicense } from '@/db/eeLicense'
import type { EELicense } from '@/db/eeLicense'

/**
 * React Query hook to fetch and cache the active EE license for a workspace.
 * Returns license data and helper methods for feature checking.
 */
export function useEELicense(workspaceId: string | undefined) {
    const { data: license, isLoading } = useQuery<EELicense | null>({
        queryKey: ['ee-license', workspaceId],
        queryFn: () => fetchEELicense(workspaceId ?? ''),
        enabled: !!workspaceId,
        staleTime: 5 * 60 * 1000,       // Cache for 5 minutes
        refetchOnWindowFocus: false,
    })

    const isEnterprise = !!license
    const plan = license?.plan ?? 'free'

    /**
     * Check if a specific EE feature is enabled by the workspace license.
     * Returns true if the feature is in the license's features array.
     */
    function hasFeature(feature: string): boolean {
        if (!license) return false
        return license.features.includes(feature)
    }

    return {
        license,
        isLoading,
        isEnterprise,
        plan,
        hasFeature,
    }
}
