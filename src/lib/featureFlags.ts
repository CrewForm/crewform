// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// featureFlags.ts — Runtime feature gating for CE/EE split.

import type { ReactNode } from 'react'
import { useEELicense } from '@/hooks/useEELicense'

/**
 * Minimum plan required for each EE feature.
 * Used to show the correct badge label (Pro / Team / Enterprise).
 */
export const FEATURE_MIN_PLAN: Record<string, string> = {
    // Pro tier
    prompt_history: 'Pro',
    advanced_analytics: 'Pro',
    file_attachments: 'Pro',
    advanced_webhooks: 'Pro',
    team_triggers: 'Pro',
    billing: 'Pro',
    orchestrator_mode: 'Pro',
    messaging_channels: 'Pro',
    custom_tools: 'Pro',
    chat_widget: 'Pro',
    // Team tier
    collaboration_mode: 'Team',
    team_memory: 'Team',
    rbac: 'Team',
    // Enterprise tier
    audit_logs: 'Enterprise',
    swarm: 'Enterprise',
    marketplace_publish: 'Enterprise',
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
