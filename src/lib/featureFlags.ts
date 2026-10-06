// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// featureFlags.ts — Runtime feature gating for CE/EE split.

import type { ReactNode } from 'react'
import { useEELicense } from '@/hooks/useEELicense'

export const COMMUNITY_FEATURES = new Set(['orchestrator_mode', 'marketplace_publish', 'a2a_publish', 'chat_widget'])

/**
 * Minimum plan required for each EE feature.
 * Used to show the correct badge label (Pro / Team / Enterprise).
 */
export const FEATURE_MIN_PLAN: Record<string, string> = {
    // Community capabilities
    orchestrator_mode: 'Free',
    marketplace_publish: 'Free',
    a2a_publish: 'Free',
    chat_widget: 'Free',
    // Pro tier
    prompt_history: 'Pro',
    advanced_analytics: 'Pro',
    file_attachments: 'Pro',
    advanced_webhooks: 'Pro',
    team_triggers: 'Pro',
    billing: 'Pro',
    messaging_channels: 'Pro',
    custom_tools: 'Pro',
    // Team tier
    collaboration_mode: 'Team',
    team_memory: 'Team',
    rbac: 'Team',
    // Enterprise tier
    audit_logs: 'Enterprise',
    swarm: 'Enterprise',
    admin_panel: 'Enterprise',
}

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
