// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AdminWorkspace {
    id: string
    name: string
    slug: string
    owner_id: string
    plan: string
    created_at: string
    member_count: number
    subscription_plan: string | null
    subscription_status: string | null
    is_beta: boolean
}

export interface AdminUser {
    id: string
    email: string
    created_at: string
    last_sign_in_at: string | null
    workspace_count: number
}

export interface PlatformStats {
    totalWorkspaces: number
    totalUsers: number
    totalAgents: number
    totalTasks: number
    planBreakdown: { plan: string; count: number }[]
}

// ─── Super Admin Check ──────────────────────────────────────────────────────

/** Check if the current user is a super admin */
export async function checkIsSuperAdmin(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const result = await supabase
        .from('super_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .single()

    return !result.error
}

// ─── All Workspaces ─────────────────────────────────────────────────────────

/** Fetch all workspaces with subscription info (super admin only) */
export async function fetchAllWorkspaces(): Promise<AdminWorkspace[]> {
    const workspacesResult = await supabase
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: false })

    if (workspacesResult.error) throw workspacesResult.error

    const workspaces = workspacesResult.data as Array<{
        id: string; name: string; slug: string; owner_id: string;
        plan: string; created_at: string; is_beta: boolean
    }>

    // Fetch member counts
    const memberResult = await supabase
        .from('workspace_members')
        .select('workspace_id')

    const memberCounts = new Map<string, number>()
    if (!memberResult.error) {
        for (const m of memberResult.data as Array<{ workspace_id: string }>) {
            memberCounts.set(m.workspace_id, (memberCounts.get(m.workspace_id) ?? 0) + 1)
        }
    }

    // Fetch subscriptions
    const subResult = await supabase
        .from('subscriptions')
        .select('workspace_id, plan, status')

    const subMap = new Map<string, { plan: string; status: string }>()
    if (!subResult.error) {
        for (const s of subResult.data as Array<{ workspace_id: string; plan: string; status: string }>) {
            subMap.set(s.workspace_id, s)
        }
    }

    return workspaces.map(w => ({
        ...w,
        member_count: memberCounts.get(w.id) ?? 0,
        subscription_plan: subMap.get(w.id)?.plan ?? 'free',
        subscription_status: subMap.get(w.id)?.status ?? 'active',
    }))
}

// ─── Platform Stats ─────────────────────────────────────────────────────────

/** Fetch platform-level statistics (super admin only) */
export async function fetchPlatformStats(): Promise<PlatformStats> {
    const [workspaces, agents, tasks, subs] = await Promise.all([
        supabase.from('workspaces').select('id', { count: 'exact', head: true }),
        supabase.from('agents').select('id', { count: 'exact', head: true }),
        supabase.from('tasks').select('id', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('plan'),
    ])

    // Count plans
    const planCounts = new Map<string, number>()
    if (!subs.error) {
        for (const s of subs.data as Array<{ plan: string }>) {
            planCounts.set(s.plan, (planCounts.get(s.plan) ?? 0) + 1)
        }
    }

    return {
        totalWorkspaces: workspaces.count ?? 0,
        totalUsers: 0, // Can't count auth.users from client — use workspace count as proxy
        totalAgents: agents.count ?? 0,
        totalTasks: tasks.count ?? 0,
        planBreakdown: Array.from(planCounts.entries()).map(([plan, count]) => ({ plan, count })),
    }
}

/** Update a workspace's plan (super admin override) */
export async function overrideWorkspacePlan(workspaceId: string, plan: string): Promise<void> {
    // Update subscription
    const result = await supabase
        .from('subscriptions')
        .update({ plan })
        .eq('workspace_id', workspaceId)

    if (result.error) throw result.error

    // Also update workspace.plan for consistency
    await supabase
        .from('workspaces')
        .update({ plan })
        .eq('id', workspaceId)
}

/** Toggle beta status for a workspace */
export async function toggleBeta(workspaceId: string, isBeta: boolean): Promise<void> {
    const result = await supabase
        .from('workspaces')
        .update({ is_beta: isBeta })
        .eq('id', workspaceId)

    if (result.error) throw result.error
}

// ─── Beta User Management ───────────────────────────────────────────────────

export interface BetaUser {
    user_id: string
    email: string
    full_name: string
    is_beta: boolean
    beta_approved: boolean
    created_at: string
    last_sign_in_at: string | null
}

/** Fetch all beta users (super admin only) */
export async function fetchBetaUsers(): Promise<BetaUser[]> {
    const result = await supabase.rpc('list_beta_users')
    if (result.error) throw result.error
    return result.data as BetaUser[]
}

/** Approve a beta user and send notification email (super admin only) */
export async function approveBetaUser(userId: string): Promise<void> {
    // 1. Fetch user info before approving (need email + name for the email)
    const listResult = await supabase.rpc('list_beta_users')
    const users = (listResult.data ?? []) as BetaUser[]
    const user = users.find(u => u.user_id === userId)

    // 2. Approve in the DB
    const result = await supabase.rpc('approve_beta_user', { p_user_id: userId })
    if (result.error) throw result.error

    // 3. Send approval notification email (fire-and-forget — don't block on failure)
    if (user?.email) {
        void supabase.functions.invoke('beta-approved', {
            body: { email: user.email, full_name: user.full_name },
        }).then(res => {
            if (res.error) {
                console.error('[approveBetaUser] Failed to send approval email:', res.error)
            }
        })
    }
}

/** Revoke beta approval (super admin only) */
export async function revokeBetaUser(userId: string): Promise<void> {
    const result = await supabase.rpc('revoke_beta_user', { p_user_id: userId })
    if (result.error) throw result.error
}
