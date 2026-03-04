// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// featureFlags.ts — Runtime feature gating for CE/EE split.

import type { ReactNode } from 'react'
import { useEELicense } from '@/hooks/useEELicense'

/**
 * Check if the current environment is running the Enterprise Edition.
 * Uses the VITE_CREWFORM_EDITION env variable set at build time.
 * When 'ce', all EE features are disabled regardless of license.
 */
export function isCommunityEdition(): boolean {
    return import.meta.env.VITE_CREWFORM_EDITION === 'ce'
}

/**
 * React hook to check if a specific EE feature is available.
 * Returns { enabled, isLoading } for use in components.
 */
export function useEEFeature(workspaceId: string | undefined, feature: string) {
    const { hasFeature, isLoading, isEnterprise } = useEELicense(workspaceId)

    // CE build — features always disabled
    if (isCommunityEdition()) {
        return { enabled: false, isLoading: false, isEnterprise: false }
    }

    return {
        enabled: hasFeature(feature),
        isLoading,
        isEnterprise,
    }
}

/**
 * Props for the EEGate wrapper component.
 */
export interface EEGateProps {
    workspaceId: string | undefined
    feature: string
    children: ReactNode
    fallback?: ReactNode
}
