// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm (AntiGravity Pty Ltd)
// Legacy import path; all listed software features are available under MIT.
//
// features.ts — Compatibility names for implemented software features.

export const EE_FEATURES = {
    COLLABORATION_MODE: 'collaboration_mode',
    TEAM_MEMORY: 'team_memory',
    AUDIT_LOGS: 'audit_logs',
    ADVANCED_ANALYTICS: 'advanced_analytics',
    PROMPT_HISTORY: 'prompt_history',
    ADVANCED_WEBHOOKS: 'advanced_webhooks',
    MESSAGING_CHANNELS: 'messaging_channels',
    TEAM_TRIGGERS: 'team_triggers',
    FILE_ATTACHMENTS: 'file_attachments',
    SWARM: 'swarm',
    BILLING: 'billing',
    RBAC: 'rbac',
    CUSTOM_TOOLS: 'custom_tools',
    ADMIN_PANEL: 'admin_panel',
} as const;

export type EEFeature = (typeof EE_FEATURES)[keyof typeof EE_FEATURES];

/**
 * All features included in each plan tier.
 * Higher tiers include all features from lower tiers.
 */
import { PLAN_CATALOGUE } from './planCatalogue';
export const PLAN_FEATURES: Record<string, EEFeature[]> = Object.fromEntries(Object.entries(PLAN_CATALOGUE.plans).map(([key, plan]) => [key, [...plan.features] as EEFeature[]]));
