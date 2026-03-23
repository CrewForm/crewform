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
    suspended_at: string | null
    suspended_reason: string | null
    owner_email: string
    owner_name: string
}

export interface AdminUser {
    id: string
    email: string
    full_name: string
    created_at: string
    last_sign_in_at: string | null
    workspace_count: number
}

export interface PlatformStats {
    totalWorkspaces: number
    totalUsers: number
    activeUsersLast7d: number
    totalAgents: number
    totalTasks: number
    totalTokens: number
    totalCostUsd: number
    planBreakdown: { plan: string; count: number }[]
}

export interface AuditLogEntry {
    id: string
    workspace_id: string
    workspace_name: string
    actor_id: string | null
    actor_email: string
    action: string
    resource_type: string
    resource_id: string | null
    details: Record<string, unknown>
    created_at: string
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
        plan: string; created_at: string; is_beta: boolean;
        suspended_at: string | null; suspended_reason: string | null
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

    // Fetch owner profiles (display_name from user_profiles; email is only on auth.users)
    const ownerIds = [...new Set(workspaces.map(w => w.owner_id))]
    const profileResult = ownerIds.length > 0
        ? await supabase.from('user_profiles').select('id, display_name').in('id', ownerIds)
        : { data: [], error: null }

    const profileMap = new Map<string, { display_name: string }>()
    if (!profileResult.error) {
        for (const p of profileResult.data as Array<{ id: string; display_name: string }>) {
            profileMap.set(p.id, p)
        }
    }

    return workspaces.map(w => ({
        ...w,
        member_count: memberCounts.get(w.id) ?? 0,
        subscription_plan: subMap.get(w.id)?.plan ?? 'free',
        subscription_status: subMap.get(w.id)?.status ?? 'active',
        owner_name: profileMap.get(w.owner_id)?.display_name ?? '',
        owner_email: '',  // email available via admin_list_users RPC (auth.users), not user_profiles
    }))
}

// ─── Platform Stats ─────────────────────────────────────────────────────────

/** Fetch platform-level statistics (super admin only) */
export async function fetchPlatformStats(): Promise<PlatformStats> {
    const [workspaces, agents, tasks, subs, rpcResult] = await Promise.all([
        supabase.from('workspaces').select('id', { count: 'exact', head: true }),
        supabase.from('agents').select('id', { count: 'exact', head: true }),
        supabase.from('tasks').select('id', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('plan'),
        supabase.rpc('admin_platform_stats'),
    ])

    // Count plans
    const planCounts = new Map<string, number>()
    if (!subs.error) {
        for (const s of subs.data as Array<{ plan: string }>) {
            planCounts.set(s.plan, (planCounts.get(s.plan) ?? 0) + 1)
        }
    }

    const rpcData = (rpcResult.data ?? {}) as {
        total_users?: number
        active_users_7d?: number
        total_tokens?: number
        total_cost_usd?: number
    }

    return {
        totalWorkspaces: workspaces.count ?? 0,
        totalUsers: rpcData.total_users ?? 0,
        activeUsersLast7d: rpcData.active_users_7d ?? 0,
        totalAgents: agents.count ?? 0,
        totalTasks: tasks.count ?? 0,
        totalTokens: rpcData.total_tokens ?? 0,
        totalCostUsd: rpcData.total_cost_usd ?? 0,
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

// ─── All Users (super admin) ────────────────────────────────────────────────

/** Fetch all platform users with profile and workspace info */
export async function fetchAllUsers(): Promise<AdminUser[]> {
    const result = await supabase.rpc('admin_list_users')
    if (result.error) throw result.error
    return result.data as AdminUser[]
}

// ─── Platform Audit Log ─────────────────────────────────────────────────────

/** Fetch platform-wide audit logs (super admin only, latest 200) */
export async function fetchPlatformAuditLogs(): Promise<AuditLogEntry[]> {
    // The actual audit data lives in the `audit_log` table (singular).
    const logsResult = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

    if (logsResult.error) throw logsResult.error

    const logs = logsResult.data as Array<{
        id: string; workspace_id: string; user_id: string | null;
        action: string; details: Record<string, unknown>; created_at: string
    }>

    if (logs.length === 0) return []

    // Fetch workspace names for display
    const wsIds = [...new Set(logs.map(l => l.workspace_id))]
    const wsResult = await supabase
        .from('workspaces')
        .select('id, name')
        .in('id', wsIds)

    const wsNames = new Map<string, string>()
    if (!wsResult.error) {
        for (const w of wsResult.data as Array<{ id: string; name: string }>) {
            wsNames.set(w.id, w.name)
        }
    }

    // Fetch actor names from user_profiles
    const actorIds = [...new Set(logs.filter(l => l.user_id).map(l => l.user_id as string))]
    const profileResult = actorIds.length > 0
        ? await supabase.from('user_profiles').select('id, display_name').in('id', actorIds)
        : { data: [], error: null }

    const actorNames = new Map<string, string>()
    if (!profileResult.error) {
        for (const p of profileResult.data as Array<{ id: string; display_name: string }>) {
            actorNames.set(p.id, p.display_name)
        }
    }

    return logs.map(l => ({
        id: l.id,
        workspace_id: l.workspace_id,
        actor_id: l.user_id,
        action: l.action,
        resource_type: typeof l.details.resource_type === 'string' ? l.details.resource_type : l.action.split('.')[0],
        resource_id: typeof l.details.resource_id === 'string' ? l.details.resource_id : null,
        details: l.details,
        created_at: l.created_at,
        workspace_name: wsNames.get(l.workspace_id) ?? 'Unknown',
        actor_email: l.user_id ? (actorNames.get(l.user_id) ?? l.user_id) : 'System',
    }))
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

// ─── Workspace Moderation ───────────────────────────────────────────────────

/** Suspend a workspace (super admin only) */
export async function suspendWorkspace(workspaceId: string, reason: string): Promise<void> {
    const result = await supabase.rpc('admin_suspend_workspace', {
        p_workspace_id: workspaceId,
        p_reason: reason,
    })
    if (result.error) throw result.error
}

/** Unsuspend a workspace (super admin only) */
export async function unsuspendWorkspace(workspaceId: string): Promise<void> {
    const result = await supabase.rpc('admin_unsuspend_workspace', {
        p_workspace_id: workspaceId,
    })
    if (result.error) throw result.error
}

/** Permanently delete a workspace (super admin only) */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
    const result = await supabase.rpc('admin_delete_workspace', {
        p_workspace_id: workspaceId,
    })
    if (result.error) throw result.error
}

// ─── Workspace Usage Stats (Abuse Dashboard) ───────────────────────────────

export interface WorkspaceUsageStats {
    workspace_id: string
    workspace_name: string
    owner_id: string
    plan: string
    suspended_at: string | null
    task_count: number
    team_run_count: number
    total_tokens: number
    total_cost_usd: number
}

/** Fetch per-workspace usage stats for the abuse dashboard (super admin only) */
export async function fetchWorkspaceUsageStats(days = 7): Promise<WorkspaceUsageStats[]> {
    const result = await supabase.rpc('admin_workspace_usage_stats', { p_days: days })
    if (result.error) throw result.error
    return result.data as WorkspaceUsageStats[]
}

// ─── Spike Detection & Key Rotation Alerts ──────────────────────────────────

export interface UsageSpikeEntry {
    workspace_id: string
    workspace_name: string
    plan: string
    suspended_at: string | null
    curr_tasks: number
    curr_runs: number
    curr_tokens: number
    curr_cost: number
    prev_tasks: number
    prev_runs: number
    prev_tokens: number
    prev_cost: number
    task_spike: number | null
    run_spike: number | null
    token_spike: number | null
    cost_spike: number | null
}

export interface KeyRotationAlert {
    workspace_id: string
    workspace_name: string
    plan: string
    keys_created: number
    keys_rotated: number
    keys_deleted: number
    total_key_ops: number
    latest_op_at: string
}

/** Fetch usage spike data (current vs previous window) */
export async function fetchUsageSpikes(days = 7): Promise<UsageSpikeEntry[]> {
    const result = await supabase.rpc('admin_usage_spikes', { p_days: days })
    if (result.error) throw result.error
    return result.data as UsageSpikeEntry[]
}

/** Fetch key rotation alerts from audit logs */
export async function fetchKeyRotationAlerts(days = 7): Promise<KeyRotationAlert[]> {
    const result = await supabase.rpc('admin_key_rotation_alerts', { p_days: days })
    if (result.error) throw result.error
    return result.data as KeyRotationAlert[]
}
