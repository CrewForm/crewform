// CrewForm Enterprise License
// Copyright (C) 2026 CrewForm (AntiGravity Pty Ltd)
// Licensed under the CrewForm Enterprise License (see ee/LICENSE)
//
// features.ts — Single source of truth for all EE feature names.

export const EE_FEATURES = {
    ORCHESTRATOR_MODE: 'orchestrator_mode',
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
    MARKETPLACE_PUBLISH: 'marketplace_publish',
    CUSTOM_TOOLS: 'custom_tools',
    ADMIN_PANEL: 'admin_panel',
    A2A_PUBLISH: 'a2a_publish',
} as const;

export type EEFeature = (typeof EE_FEATURES)[keyof typeof EE_FEATURES];

/**
 * All features included in each plan tier.
 * Higher tiers include all features from lower tiers.
 */
export const PLAN_FEATURES: Record<string, EEFeature[]> = {
    pro: [
        EE_FEATURES.PROMPT_HISTORY,
        EE_FEATURES.ADVANCED_ANALYTICS,
        EE_FEATURES.FILE_ATTACHMENTS,
        EE_FEATURES.ADVANCED_WEBHOOKS,
        EE_FEATURES.TEAM_TRIGGERS,
        EE_FEATURES.BILLING,
        EE_FEATURES.ORCHESTRATOR_MODE,
        EE_FEATURES.MESSAGING_CHANNELS,
        EE_FEATURES.CUSTOM_TOOLS,
        EE_FEATURES.A2A_PUBLISH,
    ],
    team: [
        // All pro features plus:
        EE_FEATURES.PROMPT_HISTORY,
        EE_FEATURES.ADVANCED_ANALYTICS,
        EE_FEATURES.FILE_ATTACHMENTS,
        EE_FEATURES.ADVANCED_WEBHOOKS,
        EE_FEATURES.TEAM_TRIGGERS,
        EE_FEATURES.BILLING,
        EE_FEATURES.ORCHESTRATOR_MODE,
        EE_FEATURES.MESSAGING_CHANNELS,
        EE_FEATURES.CUSTOM_TOOLS,
        EE_FEATURES.COLLABORATION_MODE,
        EE_FEATURES.TEAM_MEMORY,
        EE_FEATURES.RBAC,
        EE_FEATURES.A2A_PUBLISH,
    ],
    enterprise: [
        // All team features plus:
        EE_FEATURES.PROMPT_HISTORY,
        EE_FEATURES.ADVANCED_ANALYTICS,
        EE_FEATURES.FILE_ATTACHMENTS,
        EE_FEATURES.ADVANCED_WEBHOOKS,
        EE_FEATURES.TEAM_TRIGGERS,
        EE_FEATURES.BILLING,
        EE_FEATURES.ORCHESTRATOR_MODE,
        EE_FEATURES.COLLABORATION_MODE,
        EE_FEATURES.TEAM_MEMORY,
        EE_FEATURES.RBAC,
        EE_FEATURES.CUSTOM_TOOLS,
        EE_FEATURES.MESSAGING_CHANNELS,
        EE_FEATURES.AUDIT_LOGS,
        EE_FEATURES.SWARM,
        EE_FEATURES.MARKETPLACE_PUBLISH,
        EE_FEATURES.ADMIN_PANEL,
        EE_FEATURES.A2A_PUBLISH,
    ],
};
