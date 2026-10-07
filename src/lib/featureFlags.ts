// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// featureFlags.ts — Runtime feature gating for CE/EE split.

import { PLAN_CATALOGUE } from './planCatalogue'
import type { ReactNode } from 'react'
import { useEELicense } from '@/hooks/useEELicense'

export const COMMUNITY_FEATURES = new Set<string>(PLAN_CATALOGUE.communityFeatures)

/**
 * Minimum plan required for each EE feature.
 * Used to show the correct badge label (Pro / Team / Custom).
 */
export const FEATURE_MIN_PLAN: Record<string, string> = (() => {
    const minimum: Record<string, string> = Object.fromEntries(PLAN_CATALOGUE.communityFeatures.map(feature => [feature, 'Free']))
    for (const plan of Object.values(PLAN_CATALOGUE.plans)) {
        for (const feature of plan.features) {
            if (!(feature in minimum)) minimum[feature] = plan.name
        }
    }
    return minimum
})()

/**
 * Get the minimum plan label for a feature.
 * Falls back to 'Pro' if the feature isn't mapped.
 */
export function getMinPlanLabel(feature: string): string {
    return FEATURE_MIN_PLAN[feature] ?? 'Pro'
}

/**
 * Check if the current environment is running the Community Edition.
 * Uses the VITE_CREWFORM_EDITION env variable set at build time.
 * When 'ce', paid features are disabled regardless of license.
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

    if (COMMUNITY_FEATURES.has(feature)) return { enabled: true, isLoading: false, isEnterprise: false }

    // CE build — paid features disabled
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
