// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
    Shield, BarChart3, Building2, Search,
    Loader2, Users, Bot, ListTodo, PackageOpen, Store, XCircle, ShieldCheck,
    Activity, Coins, Zap, UserCheck,
} from 'lucide-react'
import {
    usePlatformStats, useAllWorkspaces, useOverridePlan, useToggleBeta,
    useBetaUsers, useApproveBetaUser, useAllUsers, usePlatformAuditLog,
} from '@/hooks/useAdmin'
import { ReviewQueue } from '@/components/marketplace/ReviewQueue'
import { LicenseAdminPanel } from '@/components/settings/LicenseAdminPanel'
import { fetchPublishedAgents, unpublishAgent } from '@/db/marketplace'
import { cn } from '@/lib/utils'

type AdminTab = 'overview' | 'workspaces' | 'beta-users' | 'activity' | 'review-queue' | 'marketplace' | 'licenses'

const PLAN_COLORS: Record<string, string> = {
    free: 'text-gray-400 bg-gray-500/10',
    pro: 'text-blue-400 bg-blue-500/10',
    team: 'text-purple-400 bg-purple-500/10',
    enterprise: 'text-amber-400 bg-amber-500/10',
}

/**
 * Master Admin Panel — platform overview, workspace management.
 */
export function AdminPanel() {
    const [activeTab, setActiveTab] = useState<AdminTab>('overview')

    return (
        <div className="min-h-screen bg-surface-primary p-6 lg:p-8">
            {/* Header */}
            <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                    <Shield className="h-5 w-5 text-red-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold text-gray-100">Admin Panel</h1>
                    <p className="text-xs text-gray-500">Super administrator dashboard</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="mb-6 flex overflow-x-auto border-b border-border">
                {([
                    { key: 'overview' as const, label: 'Overview', icon: BarChart3 },
                    { key: 'workspaces' as const, label: 'Workspaces', icon: Building2 },
                    { key: 'activity' as const, label: 'Activity', icon: Activity },
                    { key: 'beta-users' as const, label: 'Beta Users', icon: Users },
                    { key: 'licenses' as const, label: 'Licenses', icon: ShieldCheck },
                    { key: 'marketplace' as const, label: 'Marketplace', icon: Store },
                    { key: 'review-queue' as const, label: 'Review Queue', icon: PackageOpen },
                ] as const).map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setActiveTab(key)}
                        className={cn(
                            'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                            activeTab === key
                                ? 'border-red-400 text-gray-200'
                                : 'border-transparent text-gray-500 hover:text-gray-300',
                        )}
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && <OverviewTab />}
            {activeTab === 'workspaces' && <WorkspacesTab />}
            {activeTab === 'activity' && <ActivityTab />}
            {activeTab === 'beta-users' && <BetaUsersTab />}
            {activeTab === 'licenses' && <LicenseAdminPanel />}
            {activeTab === 'marketplace' && <MarketplaceTab />}
            {activeTab === 'review-queue' && <ReviewQueue />}
        </div>
    )
}

// ─── Overview Tab ───────────────────────────────────────────────────────────

function OverviewTab() {
    const { data: stats, isLoading } = usePlatformStats()

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    const statCards = [
        { label: 'Workspaces', value: stats?.totalWorkspaces ?? 0, icon: Building2, color: 'text-blue-400 bg-blue-500/10' },
        { label: 'Total Users', value: stats?.totalUsers ?? 0, icon: Users, color: 'text-violet-400 bg-violet-500/10' },
        { label: 'Active (7d)', value: stats?.activeUsersLast7d ?? 0, icon: UserCheck, color: 'text-emerald-400 bg-emerald-500/10' },
        { label: 'Agents', value: stats?.totalAgents ?? 0, icon: Bot, color: 'text-cyan-400 bg-cyan-500/10' },
        { label: 'Tasks', value: stats?.totalTasks ?? 0, icon: ListTodo, color: 'text-green-400 bg-green-500/10' },
        { label: 'Total Tokens', value: stats?.totalTokens ?? 0, icon: Zap, color: 'text-amber-400 bg-amber-500/10' },
    ]

    return (
        <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {statCards.map((card) => (
                    <div key={card.label} className="rounded-xl border border-border bg-surface-card p-5">
                        <div className="mb-3 flex items-center gap-2">
                            <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', card.color)}>
                                <card.icon className="h-4 w-4" />
                            </div>
                            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                                {card.label}
                            </span>
                        </div>
                        <p className="text-3xl font-bold text-gray-100">{card.value.toLocaleString()}</p>
                    </div>
                ))}
            </div>

            {/* Cost summary + Plan breakdown row */}
            <div className="grid gap-4 sm:grid-cols-2">
                {/* Total cost card */}
                <div className="rounded-xl border border-border bg-surface-card p-5">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-200">
                        <Coins className="h-4 w-4 text-gray-500" />
                        Total Platform Cost
                    </h3>
                    <p className="text-3xl font-bold text-gray-100">
                        ${(stats?.totalCostUsd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Across all workspaces</p>
                </div>

                {/* Plan breakdown */}
                {stats?.planBreakdown && stats.planBreakdown.length > 0 && (
                    <div className="rounded-xl border border-border bg-surface-card p-5">
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-200">
                            <Users className="h-4 w-4 text-gray-500" />
                            Plan Distribution
                        </h3>
                        <div className="flex flex-wrap gap-3">
                            {stats.planBreakdown.map(({ plan, count }) => (
                                <div key={plan} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', PLAN_COLORS[plan] ?? PLAN_COLORS.free)}>
                                        {plan}
                                    </span>
                                    <span className="text-sm font-medium text-gray-200">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Workspaces Tab ─────────────────────────────────────────────────────────

function WorkspacesTab() {
    const { data: workspaces, isLoading } = useAllWorkspaces()
    const { data: users } = useAllUsers()
    const overrideMutation = useOverridePlan()
    const betaMutation = useToggleBeta()
    const [search, setSearch] = useState('')

    // Build a map of user_id -> auth.users data from the admin RPC
    const authUserMap = new Map<string, { email: string; full_name: string; last_sign_in_at: string | null }>()
    if (users) {
        for (const u of users) {
            authUserMap.set(u.id, { email: u.email, full_name: u.full_name, last_sign_in_at: u.last_sign_in_at })
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    const filtered = workspaces?.filter(w =>
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        w.slug.toLowerCase().includes(search.toLowerCase()),
    ) ?? []

    return (
        <div className="space-y-4">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search workspaces..."
                    className="w-full rounded-lg border border-border bg-surface-card py-2.5 pl-10 pr-4 text-sm text-gray-200 outline-none focus:border-brand-primary"
                />
            </div>

            {/* Workspace list */}
            <div className="rounded-xl border border-border bg-surface-card overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            <th className="px-4 py-3">Workspace</th>
                            <th className="px-4 py-3">Owner</th>
                            <th className="px-4 py-3">Last Login</th>
                            <th className="px-4 py-3">Plan</th>
                            <th className="px-4 py-3">Beta</th>
                            <th className="px-4 py-3">Created</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No workspaces found</td>
                            </tr>
                        ) : (
                            filtered.map((ws) => {
                                const authUser = authUserMap.get(ws.owner_id)
                                return (
                                    <tr key={ws.id} className="hover:bg-surface-raised/50">
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-gray-200">{ws.name}</p>
                                            <p className="text-xs text-gray-500">/{ws.slug} · {ws.member_count} members</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-gray-300">{authUser?.full_name || ws.owner_name || '—'}</p>
                                            <p className="text-xs text-gray-500">{authUser?.email || ws.owner_id.slice(0, 8)}</p>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-400">
                                            {authUser?.last_sign_in_at
                                                ? new Date(authUser.last_sign_in_at).toLocaleString()
                                                : <span className="text-gray-600">{users ? 'Never' : '…'}</span>
                                            }
                                        </td>
                                        <td className="px-4 py-3">
                                            <select
                                                value={ws.plan}
                                                onChange={(e) => overrideMutation.mutate({
                                                    workspaceId: ws.id,
                                                    plan: e.target.value,
                                                })}
                                                disabled={overrideMutation.isPending}
                                                className={cn(
                                                    'rounded-md border border-transparent px-2 py-1 text-xs font-bold uppercase outline-none',
                                                    PLAN_COLORS[ws.plan],
                                                )}
                                            >
                                                <option value="free">Free</option>
                                                <option value="pro">Pro</option>
                                                <option value="team">Team</option>
                                                <option value="enterprise">Enterprise</option>
                                            </select>
                                        </td>
                                        <td className="px-4 py-3">
                                            <label className="flex cursor-pointer items-center gap-1.5">
                                                <input
                                                    type="checkbox"
                                                    checked={ws.is_beta}
                                                    onChange={() => betaMutation.mutate({
                                                        workspaceId: ws.id,
                                                        isBeta: !ws.is_beta,
                                                    })}
                                                    disabled={betaMutation.isPending}
                                                    className="h-3.5 w-3.5 rounded border-border accent-brand-primary"
                                                />
                                                <span className={cn(
                                                    'text-[10px] font-bold uppercase',
                                                    ws.is_beta ? 'text-emerald-400' : 'text-gray-600',
                                                )}>
                                                    Beta
                                                </span>
                                            </label>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-600">
                                            {new Date(ws.created_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// ─── Activity Tab ───────────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
    created: 'text-green-400 bg-green-500/10',
    updated: 'text-blue-400 bg-blue-500/10',
    deleted: 'text-red-400 bg-red-500/10',
    rotated: 'text-amber-400 bg-amber-500/10',
}

function getActionColor(action: string): string {
    for (const [key, color] of Object.entries(ACTION_COLORS)) {
        if (action.includes(key)) return color
    }
    return 'text-gray-400 bg-gray-500/10'
}

function ActivityTab() {
    const { data: logs, isLoading } = usePlatformAuditLog()
    const [search, setSearch] = useState('')

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    const entries = logs ?? []
    const filtered = entries.filter(l =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.workspace_name.toLowerCase().includes(search.toLowerCase()) ||
        l.actor_email.toLowerCase().includes(search.toLowerCase()) ||
        l.resource_type.toLowerCase().includes(search.toLowerCase()),
    )

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                    {entries.length} recent event{entries.length !== 1 ? 's' : ''} across all workspaces
                </p>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter by action, workspace, user..."
                    className="w-full rounded-lg border border-border bg-surface-card py-2.5 pl-10 pr-4 text-sm text-gray-200 outline-none focus:border-brand-primary"
                />
            </div>

            {/* Log table */}
            <div className="rounded-xl border border-border bg-surface-card overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            <th className="px-4 py-3">Time</th>
                            <th className="px-4 py-3">Workspace</th>
                            <th className="px-4 py-3">Actor</th>
                            <th className="px-4 py-3">Action</th>
                            <th className="px-4 py-3">Resource</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                    {entries.length === 0 ? 'No audit events recorded yet' : 'No matching events'}
                                </td>
                            </tr>
                        ) : (
                            filtered.map((log) => (
                                <tr key={log.id} className="hover:bg-surface-raised/50">
                                    <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                                        {new Date(log.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-300">
                                        {log.workspace_name}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-gray-400">
                                        {log.actor_email}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className={cn(
                                            'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                                            getActionColor(log.action),
                                        )}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-gray-500">
                                        {log.resource_type}
                                        {log.resource_id && (
                                            <code className="ml-1.5 rounded bg-surface-raised px-1 py-0.5 text-[10px] text-gray-600">
                                                {log.resource_id.slice(0, 8)}
                                            </code>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// ─── Beta Users Tab ─────────────────────────────────────────────────────────

function BetaUsersTab() {
    const { data: betaUsers, isLoading } = useBetaUsers()
    const approveMutation = useApproveBetaUser()
    const [search, setSearch] = useState('')

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    const users = betaUsers ?? []
    const approved = users.filter(u => u.beta_approved)
    const pending = users.filter(u => !u.beta_approved)

    const filtered = users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.full_name.toLowerCase().includes(search.toLowerCase()),
    )

    return (
        <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-4">
                <p className="text-sm text-gray-400">
                    {users.length} beta user{users.length !== 1 ? 's' : ''}
                    <span className="mx-2 text-gray-600">·</span>
                    <span className="text-emerald-400">{approved.length} approved</span>
                    <span className="mx-2 text-gray-600">·</span>
                    <span className="text-amber-400">{pending.length} pending</span>
                </p>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search beta users..."
                    className="w-full rounded-lg border border-border bg-surface-card py-2.5 pl-10 pr-4 text-sm text-gray-200 outline-none focus:border-brand-primary"
                />
            </div>

            {/* User list */}
            <div className="rounded-xl border border-border bg-surface-card divide-y divide-border/50">
                {filtered.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-500">
                        {users.length === 0 ? 'No beta users yet' : 'No matching users'}
                    </div>
                ) : (
                    filtered.map((user) => (
                        <div key={user.user_id} className="flex items-center gap-4 px-4 py-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                                <Users className="h-4 w-4 text-blue-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-200">
                                    {user.full_name || user.email}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {user.email} · Joined {new Date(user.created_at).toLocaleDateString()}
                                </p>
                            </div>
                            <span className={cn(
                                'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                                user.beta_approved
                                    ? 'text-emerald-400 bg-emerald-500/10'
                                    : 'text-amber-400 bg-amber-500/10',
                            )}>
                                {user.beta_approved ? 'Approved' : 'Pending'}
                            </span>
                            <button
                                type="button"
                                disabled={approveMutation.isPending}
                                onClick={() => approveMutation.mutate({
                                    userId: user.user_id,
                                    approve: !user.beta_approved,
                                })}
                                className={cn(
                                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                                    user.beta_approved
                                        ? 'border-red-600/30 text-red-400 hover:bg-red-600/10'
                                        : 'border-emerald-600/30 text-emerald-400 hover:bg-emerald-600/10',
                                )}
                            >
                                {user.beta_approved ? 'Revoke' : 'Approve'}
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

// ─── Marketplace Tab ────────────────────────────────────────────────────────

function MarketplaceTab() {
    const [agents, setAgents] = useState<Array<{
        id: string; name: string; provider: string; model: string;
        install_count: number; rating_avg: number; workspace_id: string;
        workspace_name: string; owner_email: string
    }>>([])
    const [isLoading, setIsLoading] = useState(true)
    const [removing, setRemoving] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    async function loadAgents() {
        setIsLoading(true)
        try {
            const data = await fetchPublishedAgents()
            setAgents(data)
        } catch {
            // ignore
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => { void loadAgents() }, [])

    async function handleRemove(agentId: string, agentName: string) {
        const reason = prompt(
            `Remove "${agentName}" from the marketplace?\n\nPlease provide a reason for removal (this will be communicated to the agent owner):`,
        )
        if (reason === null) return // cancelled
        if (!reason.trim()) {
            toast.error('A removal reason is required.')
            return
        }
        setRemoving(agentId)
        try {
            await unpublishAgent(agentId)
            setAgents(prev => prev.filter(a => a.id !== agentId))
            toast.success(`"${agentName}" has been removed from the marketplace.`)
        } catch {
            toast.error('Failed to remove agent.')
        } finally {
            setRemoving(null)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    const filtered = agents.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.provider.toLowerCase().includes(search.toLowerCase()) ||
        a.workspace_name.toLowerCase().includes(search.toLowerCase()) ||
        a.owner_email.toLowerCase().includes(search.toLowerCase()),
    )

    return (
        <div className="space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                    {agents.length} published agent{agents.length !== 1 ? 's' : ''}
                </p>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search published agents..."
                    className="w-full rounded-lg border border-border bg-surface-card py-2.5 pl-10 pr-4 text-sm text-gray-200 outline-none focus:border-brand-primary"
                />
            </div>

            {/* Agent list */}
            <div className="rounded-xl border border-border bg-surface-card divide-y divide-border/50">
                {filtered.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-500">
                        {agents.length === 0 ? 'No agents published yet' : 'No matching agents'}
                    </div>
                ) : (
                    filtered.map((agent) => (
                        <div key={agent.id} className="flex items-center gap-4 px-4 py-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary/10">
                                <Bot className="h-4 w-4 text-brand-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-200">{agent.name}</p>
                                <p className="text-xs text-gray-500">
                                    {agent.provider} · {agent.model} · {agent.install_count} install{agent.install_count !== 1 ? 's' : ''}
                                    {agent.rating_avg > 0 && ` · ★ ${agent.rating_avg}`}
                                </p>
                                <p className="text-[10px] text-gray-600">
                                    {agent.workspace_name} · {agent.owner_email}
                                </p>
                            </div>
                            <button
                                type="button"
                                disabled={removing === agent.id}
                                onClick={() => void handleRemove(agent.id, agent.name)}
                                className="flex items-center gap-1.5 rounded-lg border border-red-600/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/10 disabled:opacity-50"
                            >
                                {removing === agent.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <XCircle className="h-3.5 w-3.5" />
                                )}
                                Remove
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
