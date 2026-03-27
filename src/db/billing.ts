// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Subscription {
    id: string
    workspace_id: string
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    plan: 'free' | 'pro' | 'team' | 'enterprise'
    status: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'incomplete'
    current_period_start: string | null
    current_period_end: string | null
    cancel_at_period_end: boolean
    created_at: string
}

export interface PlanLimit {
    plan: string
    resource: string
    max_value: number // -1 = unlimited
}

export interface QuotaCheckResult {
    allowed: boolean
    current: number
    limit: number // -1 = unlimited
    resource: string
}

export interface UsageSummary {
    agents: number
    tasksThisMonth: number
    teams: number
    members: number
    triggers: number
    marketplaceInstalls: number
    knowledgeDocuments: number
}

// ─── Subscription ───────────────────────────────────────────────────────────

/** Fetch the subscription for a workspace */
export async function fetchSubscription(workspaceId: string): Promise<Subscription | null> {
    const result = await supabase
        .from('subscriptions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .single()

    if (result.error) {
        // No subscription found — workspace is on free tier
        if (result.error.code === 'PGRST116') return null
        throw result.error
    }

    return result.data as Subscription
}

// ─── Plan Limits ────────────────────────────────────────────────────────────

/** Fetch all plan limits for a specific plan */
export async function fetchPlanLimits(plan: string): Promise<PlanLimit[]> {
    const result = await supabase
        .from('plan_limits')
        .select('*')
        .eq('plan', plan)

    if (result.error) throw result.error
    return result.data as PlanLimit[]
}

/** Get the limit for a specific resource on a plan */
export async function getPlanLimit(plan: string, resource: string): Promise<number> {
    const result = await supabase
        .from('plan_limits')
        .select('max_value')
        .eq('plan', plan)
        .eq('resource', resource)
        .single()

    if (result.error) return 0
    return (result.data as { max_value: number }).max_value
}

// ─── Usage Counting ─────────────────────────────────────────────────────────

/** Count current resource usage for a workspace */
export async function fetchCurrentUsage(workspaceId: string): Promise<UsageSummary> {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const [agents, tasks, teams, members, triggers, installs, kbDocs] = await Promise.all([
        supabase
            .from('agents')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId),
        supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .gte('created_at', startOfMonth.toISOString()),
        supabase
            .from('teams')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId),
        supabase
            .from('workspace_members')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId),
        supabase
            .from('agent_triggers')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId),
        supabase
            .from('marketplace_installs')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId),
        supabase
            .from('knowledge_documents')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId),
    ])

    return {
        agents: agents.count ?? 0,
        tasksThisMonth: tasks.count ?? 0,
        teams: teams.count ?? 0,
        members: members.count ?? 0,
        triggers: triggers.count ?? 0,
        marketplaceInstalls: installs.count ?? 0,
        knowledgeDocuments: kbDocs.count ?? 0,
    }
}

// ─── Quota Checking ─────────────────────────────────────────────────────────

/** Check if a resource action is allowed under the current plan */
export async function checkQuota(
    workspaceId: string,
    resource: string,
): Promise<QuotaCheckResult> {
    // Fetch workspace to get plan and beta flag
    const wsResult = await supabase
        .from('workspaces')
        .select('plan, is_beta')
        .eq('id', workspaceId)
        .single()

    if (wsResult.error) {
        // If we can't read workspace, deny by default
        return { allowed: false, current: 0, limit: 0, resource }
    }

    const ws = wsResult.data as { plan: string; is_beta: boolean }

    // Beta workspaces bypass all quota limits
    if (ws.is_beta) {
        return { allowed: true, current: 0, limit: -1, resource }
    }

    // Use workspace.plan as the single source of truth
    const plan = ws.plan || 'free'

    // Get limit for this resource
    const limit = await getPlanLimit(plan, resource)

    // Unlimited
    if (limit === -1) {
        return { allowed: true, current: 0, limit: -1, resource }
    }

    // Feature flag (csv_export, orchestrator, a2a_publish) — 0 means disabled, 1 means enabled
    if (resource === 'csv_export' || resource === 'orchestrator' || resource === 'a2a_publish') {
        return { allowed: limit > 0, current: 0, limit, resource }
    }

    // Get current usage
    const usage = await fetchCurrentUsage(workspaceId)
    const currentMap: Record<string, number> = {
        agents: usage.agents,
        tasks_per_month: usage.tasksThisMonth,
        teams: usage.teams,
        members: usage.members,
        triggers: usage.triggers,
        marketplace_installs: usage.marketplaceInstalls,
        knowledge_documents: usage.knowledgeDocuments,
    }

    const current = currentMap[resource] ?? 0

    return {
        allowed: current < limit,
        current,
        limit,
        resource,
    }
}

// ─── Stripe Session Calls ───────────────────────────────────────────────────

/** Create a Stripe Checkout session via Edge Function */
export async function createCheckoutSession(
    workspaceId: string,
    plan: 'pro' | 'team',
): Promise<{ url: string }> {
    void workspaceId // workspace context is inferred from JWT
    const result: { data: unknown; error: { message: string } | null } =
        await supabase.functions.invoke('stripe-checkout', {
            body: { plan },
        })

    if (result.error) throw new Error(result.error.message)
    return result.data as { url: string }
}

/** Create a Stripe Customer Portal session via Edge Function */
export async function createPortalSession(
    workspaceId: string,
): Promise<{ url: string }> {
    void workspaceId // workspace context is inferred from JWT
    const result: { data: unknown; error: { message: string } | null } =
        await supabase.functions.invoke('stripe-portal', {})

    if (result.error) throw new Error(result.error.message)
    return result.data as { url: string }
}

