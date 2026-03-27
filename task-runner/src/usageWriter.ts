// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from './supabase';

// ─── Billing Model Detection ─────────────────────────────────────────────────

export type BillingModel = 'per-token' | 'subscription-quota' | 'unknown';

const PROVIDER_BILLING: Record<string, BillingModel> = {
    anthropic: 'per-token',
    openai: 'per-token',
    google: 'per-token',
    mistral: 'per-token',
    groq: 'per-token',
    cohere: 'per-token',
    openrouter: 'per-token',
    ollama: 'subscription-quota',
};

/**
 * Detect billing model for a provider.
 * Per-token providers charge based on usage; subscription/self-hosted providers
 * show "Subscription" instead of a dollar cost.
 */
export function detectBillingModel(provider: string): BillingModel {
    return PROVIDER_BILLING[provider.toLowerCase()] ?? 'unknown';
}

// ─── Usage Record Writers ────────────────────────────────────────────────────

interface TaskUsageInput {
    workspaceId: string;
    taskId: string;
    agentId: string;
    provider: string;
    model: string;
    tokensUsed: number;
    promptTokens?: number;
    completionTokens?: number;
    costEstimateUsd: number;
}

/**
 * Write a `task_execution` usage record after a task completes.
 */
export async function writeTaskUsageRecord(input: TaskUsageInput): Promise<void> {
    const billingModel = detectBillingModel(input.provider);

    const { error } = await supabase.from('usage_records').insert({
        workspace_id: input.workspaceId,
        event_type: 'task_execution',
        tokens_used: input.tokensUsed,
        prompt_tokens: input.promptTokens ?? 0,
        completion_tokens: input.completionTokens ?? 0,
        cost_usd: billingModel === 'per-token' ? input.costEstimateUsd : 0,
        agent_id: input.agentId,
        task_id: input.taskId,
        metadata: {
            provider: input.provider,
            model: input.model,
            billing_model: billingModel,
        },
    });

    if (error) {
        console.error(`[UsageWriter] Failed to write task usage record for task ${input.taskId}:`, error.message);
    } else {
        console.log(`[UsageWriter] Recorded task usage: ${input.tokensUsed} tokens, $${input.costEstimateUsd.toFixed(4)} (${billingModel})`);
    }
}

interface TeamRunUsageInput {
    workspaceId: string;
    teamRunId: string;
    agentId: string;
    provider: string;
    model: string;
    stepIndex: number;
    stepName: string;
    tokensUsed: number;
    promptTokens?: number;
    completionTokens?: number;
    costEstimateUsd: number;
}

/**
 * Write a `team_run` usage record after each pipeline step completes.
 */
export async function writeTeamRunUsageRecord(input: TeamRunUsageInput): Promise<void> {
    const billingModel = detectBillingModel(input.provider);

    const { error } = await supabase.from('usage_records').insert({
        workspace_id: input.workspaceId,
        event_type: 'team_run',
        tokens_used: input.tokensUsed,
        prompt_tokens: input.promptTokens ?? 0,
        completion_tokens: input.completionTokens ?? 0,
        cost_usd: billingModel === 'per-token' ? input.costEstimateUsd : 0,
        agent_id: input.agentId,
        team_run_id: input.teamRunId,
        metadata: {
            provider: input.provider,
            model: input.model,
            billing_model: billingModel,
            step_index: input.stepIndex,
            step_name: input.stepName,
        },
    });

    if (error) {
        console.error(`[UsageWriter] Failed to write team run usage record for run ${input.teamRunId} step ${input.stepIndex}:`, error.message);
    } else {
        console.log(`[UsageWriter] Recorded team run step ${input.stepIndex} usage: ${input.tokensUsed} tokens, $${input.costEstimateUsd.toFixed(4)} (${billingModel})`);
    }
}
