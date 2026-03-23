// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
    Shield, BarChart3, Building2, Search,
    Loader2, Users, Bot, ListTodo, PackageOpen, Store, XCircle, ShieldCheck,
    Activity, Coins, Zap, UserCheck, Ban, Trash2, ShieldOff, AlertTriangle, KeyRound,
    TrendingUp, ArrowUpRight,
} from 'lucide-react'
import {
    usePlatformStats, useAllWorkspaces, useOverridePlan, useToggleBeta,
    useBetaUsers, useApproveBetaUser, useAllUsers, usePlatformAuditLog,
    useSuspendWorkspace, useUnsuspendWorkspace, useDeleteWorkspace,
    useWorkspaceUsageStats, useUsageSpikes, useKeyRotationAlerts,
} from '@/hooks/useAdmin'
import { ReviewQueue } from '@/components/marketplace/ReviewQueue'
import { LicenseAdminPanel } from '@/components/settings/LicenseAdminPanel'
import { fetchPublishedAgents, unpublishAgent } from '@/db/marketplace'
import { cn } from '@/lib/utils'

type AdminTab = 'overview' | 'workspaces' | 'abuse' | 'beta-users' | 'activity' | 'review-queue' | 'marketplace' | 'licenses'

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
                    { key: 'abuse' as const, label: 'Abuse', icon: AlertTriangle },
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
            {activeTab === 'abuse' && <AbuseTab />}
            {activeTab === 'activity' && <ActivityTab />}
            {activeTab === 'beta-users' && <BetaUsersTab />}
            {activeTab === 'licenses' && <LicenseAdminPanel />}
            {activeTab === 'marketplace' && <MarketplaceTab />}
            {activeTab === 'review-queue' && (
                <div className="space-y-6">
                    <ReviewQueue />
                    <ScannerConfigPanel />
                </div>
            )}
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
    const suspendMutation = useSuspendWorkspace()
    const unsuspendMutation = useUnsuspendWorkspace()
    const deleteMutation = useDeleteWorkspace()
    const [search, setSearch] = useState('')
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
    const [deleteInput, setDeleteInput] = useState('')

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

    function handleSuspend(wsId: string, wsName: string) {
        const reason = prompt(
            `Suspend workspace "${wsName}"?\n\nProvide a reason (shown to the workspace owner):`,
        )
        if (reason === null) return
        if (!reason.trim()) {
            toast.error('A suspension reason is required.')
            return
        }
        suspendMutation.mutate({ workspaceId: wsId, reason: reason.trim() }, {
            onSuccess: () => toast.success(`"${wsName}" has been suspended.`),
            onError: () => toast.error('Failed to suspend workspace.'),
        })
    }

    function handleUnsuspend(wsId: string, wsName: string) {
        unsuspendMutation.mutate({ workspaceId: wsId }, {
            onSuccess: () => toast.success(`"${wsName}" has been unsuspended.`),
            onError: () => toast.error('Failed to unsuspend workspace.'),
        })
    }

    function handleDelete() {
        if (!deleteConfirm || deleteInput !== deleteConfirm.name) return
        deleteMutation.mutate({ workspaceId: deleteConfirm.id }, {
            onSuccess: () => {
                toast.success(`"${deleteConfirm.name}" has been permanently deleted.`)
                setDeleteConfirm(null)
                setDeleteInput('')
            },
            onError: () => toast.error('Failed to delete workspace.'),
        })
    }

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
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Last Login</th>
                            <th className="px-4 py-3">Plan</th>
                            <th className="px-4 py-3">Beta</th>
                            <th className="px-4 py-3">Created</th>
                            <th className="px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No workspaces found</td>
                            </tr>
                        ) : (
                            filtered.map((ws) => {
                                const authUser = authUserMap.get(ws.owner_id)
                                const isSuspended = !!ws.suspended_at
                                return (
                                    <tr key={ws.id} className={cn('hover:bg-surface-raised/50', isSuspended && 'bg-red-500/5')}>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-gray-200">{ws.name}</p>
                                            <p className="text-xs text-gray-500">/{ws.slug} · {ws.member_count} members</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-gray-300">{authUser?.full_name || ws.owner_name || '—'}</p>
                                            <p className="text-xs text-gray-500">{authUser?.email || ws.owner_id.slice(0, 8)}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            {isSuspended ? (
                                                <div>
                                                    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-400 bg-red-500/10">
                                                        <Ban className="h-3 w-3" />
                                                        Suspended
                                                    </span>
                                                    {ws.suspended_reason && (
                                                        <p className="mt-0.5 text-[10px] text-red-400/70 max-w-[160px] truncate" title={ws.suspended_reason}>
                                                            {ws.suspended_reason}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-400 bg-emerald-500/10">
                                                    Active
                                                </span>
                                            )}
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
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                {isSuspended ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUnsuspend(ws.id, ws.name)}
                                                        disabled={unsuspendMutation.isPending}
                                                        title="Unsuspend workspace"
                                                        className="flex items-center gap-1 rounded-lg border border-emerald-600/30 px-2 py-1 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-600/10 disabled:opacity-50"
                                                    >
                                                        <ShieldOff className="h-3 w-3" />
                                                        Unsuspend
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSuspend(ws.id, ws.name)}
                                                        disabled={suspendMutation.isPending}
                                                        title="Suspend workspace"
                                                        className="flex items-center gap-1 rounded-lg border border-amber-600/30 px-2 py-1 text-[11px] font-medium text-amber-400 transition-colors hover:bg-amber-600/10 disabled:opacity-50"
                                                    >
                                                        <Ban className="h-3 w-3" />
                                                        Suspend
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => { setDeleteConfirm({ id: ws.id, name: ws.name }); setDeleteInput('') }}
                                                    title="Delete workspace"
                                                    className="flex items-center gap-1 rounded-lg border border-red-600/30 px-2 py-1 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-600/10"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Delete confirmation modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-gray-900 p-6 shadow-2xl">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                                <Trash2 className="h-5 w-5 text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-100">Delete Workspace</h3>
                                <p className="text-xs text-gray-500">This action is irreversible</p>
                            </div>
                        </div>
                        <p className="mb-3 text-sm text-gray-400">
                            This will permanently delete <strong className="text-gray-200">{deleteConfirm.name}</strong> and
                            all associated data (agents, teams, tasks, members, API keys).
                        </p>
                        <p className="mb-2 text-xs text-gray-500">
                            Type <strong className="text-gray-300">{deleteConfirm.name}</strong> to confirm:
                        </p>
                        <input
                            type="text"
                            value={deleteInput}
                            onChange={(e) => setDeleteInput(e.target.value)}
                            placeholder={deleteConfirm.name}
                            className="mb-4 w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-gray-200 outline-none focus:border-red-400"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => { setDeleteConfirm(null); setDeleteInput('') }}
                                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-gray-400 hover:bg-surface-raised"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={deleteInput !== deleteConfirm.name || deleteMutation.isPending}
                                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                            >
                                {deleteMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Delete Permanently
                            </button>
                        </div>
                    </div>
                </div>
            )}
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

// ─── Scanner Config Panel ───────────────────────────────────────────────────

function ScannerConfigPanel() {
    const [agentId, setAgentId] = useState('')
    const [agentName, setAgentName] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    // Load existing config
    useEffect(() => {
        void (async () => {
            try {
                const { supabase: sb } = await import('@/lib/supabase')
                const { data } = await sb
                    .from('system_config')
                    .select('key, value')
                    .in('key', ['scanner_agent_id'])

                if (data && data.length > 0) {
                    const row = (data as Array<{ key: string; value: string }>).find(r => r.key === 'scanner_agent_id')
                    if (row) {
                        setAgentId(row.value)
                        const { data: agentData } = await sb
                            .from('agents')
                            .select('name')
                            .eq('id', row.value)
                            .single()
                        if (agentData) setAgentName((agentData as { name: string }).name)
                    }
                }
            } catch {
                // Config table may not exist yet
            } finally {
                setIsLoading(false)
            }
        })()
    }, [])

    const handleSave = async () => {
        if (!agentId.trim()) return
        setIsSaving(true)

        try {
            const { supabase: sb } = await import('@/lib/supabase')

            // Look up the agent to get its workspace_id
            const { data: agentData, error: agentError } = await sb
                .from('agents')
                .select('id, name, workspace_id')
                .eq('id', agentId.trim())
                .single()

            if (agentError) {
                toast.error('Agent not found. Please check the ID.')
                setIsSaving(false)
                return
            }

            const agent = agentData as { id: string; name: string; workspace_id: string }

            const { error: e1 } = await sb
                .from('system_config')
                .upsert({ key: 'scanner_agent_id', value: agent.id, updated_at: new Date().toISOString() })

            const { error: e2 } = await sb
                .from('system_config')
                .upsert({ key: 'scanner_workspace_id', value: agent.workspace_id, updated_at: new Date().toISOString() })

            if (e1 || e2) {
                toast.error('Failed to save config.')
            } else {
                setAgentName(agent.name)
                toast.success(`Scanner agent set to "${agent.name}"`)
            }
        } catch {
            toast.error('Failed to save config.')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="rounded-xl border border-border bg-surface-card p-4">
            <div className="mb-3 flex items-center gap-2">
                <Bot className="h-4 w-4 text-orange-400" />
                <h3 className="text-sm font-medium text-gray-200">AI Injection Scanner</h3>
            </div>
            <p className="mb-3 text-xs text-gray-500">
                Configure which agent performs AI-powered injection scans on marketplace submissions.
                Create a scanner agent in your workspace, then paste its ID here.
            </p>

            {isLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading config...
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={agentId}
                        onChange={(e) => { setAgentId(e.target.value); setAgentName(null) }}
                        placeholder="Scanner agent UUID"
                        className="flex-1 rounded-lg border border-border bg-surface-primary px-3 py-2 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-brand-primary"
                    />
                    <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={isSaving || !agentId.trim()}
                        className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
                    >
                        {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                        Save
                    </button>
                </div>
            )}

            {agentName && (
                <p className="mt-2 text-xs text-green-400">
                    ✓ Scanner: <span className="font-medium">{agentName}</span>
                </p>
            )}
        </div>
    )
}

// ─── Abuse Dashboard Tab ────────────────────────────────────────────────────

const ABUSE_THRESHOLDS = {
    taskCount: 500,
    teamRunCount: 100,
    tokens: 5_000_000,
    costUsd: 50,
}

function AbuseTab() {
    const [days, setDays] = useState(7)
    const { data: stats, isLoading } = useWorkspaceUsageStats(days)
    const suspendMutation = useSuspendWorkspace()
    const [search, setSearch] = useState('')

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    const entries = stats ?? []
    const flagged = entries.filter(ws =>
        ws.task_count > ABUSE_THRESHOLDS.taskCount ||
        ws.team_run_count > ABUSE_THRESHOLDS.teamRunCount ||
        ws.total_tokens > ABUSE_THRESHOLDS.tokens ||
        ws.total_cost_usd > ABUSE_THRESHOLDS.costUsd,
    )

    const filtered = entries.filter(ws =>
        ws.workspace_name.toLowerCase().includes(search.toLowerCase()),
    )

    function handleSuspend(wsId: string, wsName: string) {
        const reason = prompt(
            `Suspend workspace "${wsName}"?\n\nProvide a reason (shown to the workspace owner):`,
        )
        if (reason === null) return
        if (!reason.trim()) {
            toast.error('A suspension reason is required.')
            return
        }
        suspendMutation.mutate({ workspaceId: wsId, reason: reason.trim() }, {
            onSuccess: () => toast.success(`"${wsName}" has been suspended.`),
            onError: () => toast.error('Failed to suspend workspace.'),
        })
    }

    return (
        <div className="space-y-6">
            {/* Header row */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-gray-100">Usage Monitor</h2>
                    <p className="text-xs text-gray-500">
                        {flagged.length > 0 ? (
                            <span className="text-amber-400">
                                {flagged.length} workspace{flagged.length !== 1 ? 's' : ''} exceeding thresholds
                            </span>
                        ) : (
                            'No workspaces exceeding thresholds'
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-500">Time window:</label>
                    <select
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                        className="rounded-lg border border-border bg-surface-card px-3 py-1.5 text-xs text-gray-200 outline-none"
                    >
                        <option value={1}>Last 24h</option>
                        <option value={7}>Last 7 days</option>
                        <option value={30}>Last 30 days</option>
                        <option value={90}>Last 90 days</option>
                    </select>
                </div>
            </div>

            {/* Threshold info */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <p className="text-xs text-amber-300">
                    <AlertTriangle className="mr-1 inline h-3 w-3" />
                    Flagged thresholds ({days}d window): {ABUSE_THRESHOLDS.taskCount}+ tasks,{' '}
                    {ABUSE_THRESHOLDS.teamRunCount}+ team runs,{' '}
                    {(ABUSE_THRESHOLDS.tokens / 1_000_000).toFixed(0)}M+ tokens,{' '}
                    ${ABUSE_THRESHOLDS.costUsd}+ cost
                </p>
            </div>

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

            {/* Usage table */}
            <div className="rounded-xl border border-border bg-surface-card overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            <th className="px-4 py-3">Workspace</th>
                            <th className="px-4 py-3">Plan</th>
                            <th className="px-4 py-3 text-right">Tasks</th>
                            <th className="px-4 py-3 text-right">Team Runs</th>
                            <th className="px-4 py-3 text-right">Tokens</th>
                            <th className="px-4 py-3 text-right">Cost</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                                    No workspaces found
                                </td>
                            </tr>
                        ) : (
                            filtered.map((ws) => {
                                const isFlagged =
                                    ws.task_count > ABUSE_THRESHOLDS.taskCount ||
                                    ws.team_run_count > ABUSE_THRESHOLDS.teamRunCount ||
                                    ws.total_tokens > ABUSE_THRESHOLDS.tokens ||
                                    ws.total_cost_usd > ABUSE_THRESHOLDS.costUsd
                                const isSuspended = !!ws.suspended_at
                                return (
                                    <tr key={ws.workspace_id} className={cn(
                                        'hover:bg-surface-raised/50',
                                        isFlagged && !isSuspended && 'bg-amber-500/5',
                                        isSuspended && 'bg-red-500/5',
                                    )}>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {isFlagged && !isSuspended && (
                                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                                                )}
                                                <span className="font-medium text-gray-200">{ws.workspace_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={cn(
                                                'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                                                PLAN_COLORS[ws.plan] ?? PLAN_COLORS.free,
                                            )}>
                                                {ws.plan}
                                            </span>
                                        </td>
                                        <td className={cn(
                                            'px-4 py-3 text-right tabular-nums',
                                            ws.task_count > ABUSE_THRESHOLDS.taskCount ? 'text-amber-400 font-bold' : 'text-gray-300',
                                        )}>
                                            {ws.task_count.toLocaleString()}
                                        </td>
                                        <td className={cn(
                                            'px-4 py-3 text-right tabular-nums',
                                            ws.team_run_count > ABUSE_THRESHOLDS.teamRunCount ? 'text-amber-400 font-bold' : 'text-gray-300',
                                        )}>
                                            {ws.team_run_count.toLocaleString()}
                                        </td>
                                        <td className={cn(
                                            'px-4 py-3 text-right tabular-nums',
                                            ws.total_tokens > ABUSE_THRESHOLDS.tokens ? 'text-amber-400 font-bold' : 'text-gray-300',
                                        )}>
                                            {ws.total_tokens > 1_000_000
                                                ? `${(ws.total_tokens / 1_000_000).toFixed(1)}M`
                                                : ws.total_tokens > 1_000
                                                    ? `${(ws.total_tokens / 1_000).toFixed(0)}K`
                                                    : ws.total_tokens.toLocaleString()
                                            }
                                        </td>
                                        <td className={cn(
                                            'px-4 py-3 text-right tabular-nums',
                                            ws.total_cost_usd > ABUSE_THRESHOLDS.costUsd ? 'text-amber-400 font-bold' : 'text-gray-300',
                                        )}>
                                            ${ws.total_cost_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-3">
                                            {isSuspended ? (
                                                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-400 bg-red-500/10">
                                                    <Ban className="h-3 w-3" />
                                                    Suspended
                                                </span>
                                            ) : isFlagged ? (
                                                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-400 bg-amber-500/10">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    Flagged
                                                </span>
                                            ) : (
                                                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-400 bg-emerald-500/10">
                                                    Normal
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {!isSuspended && isFlagged && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleSuspend(ws.workspace_id, ws.workspace_name)}
                                                    disabled={suspendMutation.isPending}
                                                    className="flex items-center gap-1 rounded-lg border border-amber-600/30 px-2 py-1 text-[11px] font-medium text-amber-400 transition-colors hover:bg-amber-600/10 disabled:opacity-50"
                                                >
                                                    <Ban className="h-3 w-3" />
                                                    Suspend
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Spike Detection */}
            <SpikeSection days={days} />

            {/* Key Rotation Alerts */}
            <KeyRotationSection days={days} />
        </div>
    )
}

// ─── Spike Detection Sub-section ────────────────────────────────────────────

const SPIKE_THRESHOLD = 2.0

function SpikeSection({ days }: { days: number }) {
    const { data: spikes, isLoading } = useUsageSpikes(days)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            </div>
        )
    }

    const entries = spikes ?? []
    const spiked = entries.filter(ws =>
        (ws.task_spike !== null && ws.task_spike >= SPIKE_THRESHOLD) ||
        (ws.run_spike !== null && ws.run_spike >= SPIKE_THRESHOLD) ||
        (ws.cost_spike !== null && ws.cost_spike >= SPIKE_THRESHOLD),
    )

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-400" />
                <h3 className="text-sm font-semibold text-gray-200">Spike Detection</h3>
                <span className="text-xs text-gray-500">
                    Comparing last {days}d vs previous {days}d — flagging ≥{SPIKE_THRESHOLD}x increase
                </span>
            </div>

            {spiked.length === 0 ? (
                <p className="rounded-lg border border-border bg-surface-card px-4 py-6 text-center text-sm text-gray-500">
                    No usage spikes detected
                </p>
            ) : (
                <div className="rounded-xl border border-border bg-surface-card overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                <th className="px-4 py-3">Workspace</th>
                                <th className="px-4 py-3">Plan</th>
                                <th className="px-4 py-3 text-right">Tasks (prev → curr)</th>
                                <th className="px-4 py-3 text-right">Runs (prev → curr)</th>
                                <th className="px-4 py-3 text-right">Cost (prev → curr)</th>
                                <th className="px-4 py-3 text-right">Peak Spike</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {spiked.map((ws) => {
                                const peakSpike = Math.max(
                                    ws.task_spike ?? 0,
                                    ws.run_spike ?? 0,
                                    ws.cost_spike ?? 0,
                                )
                                return (
                                    <tr key={ws.workspace_id} className="hover:bg-surface-raised/50 bg-orange-500/5">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-orange-400" />
                                                <span className="font-medium text-gray-200">{ws.workspace_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={cn(
                                                'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                                                PLAN_COLORS[ws.plan] ?? PLAN_COLORS.free,
                                            )}>
                                                {ws.plan}
                                            </span>
                                        </td>
                                        <td className={cn(
                                            'px-4 py-3 text-right tabular-nums text-xs',
                                            ws.task_spike !== null && ws.task_spike >= SPIKE_THRESHOLD ? 'text-orange-400 font-bold' : 'text-gray-400',
                                        )}>
                                            {ws.prev_tasks} → {ws.curr_tasks}
                                            {ws.task_spike !== null && (
                                                <span className="ml-1 text-[10px]">({ws.task_spike}x)</span>
                                            )}
                                        </td>
                                        <td className={cn(
                                            'px-4 py-3 text-right tabular-nums text-xs',
                                            ws.run_spike !== null && ws.run_spike >= SPIKE_THRESHOLD ? 'text-orange-400 font-bold' : 'text-gray-400',
                                        )}>
                                            {ws.prev_runs} → {ws.curr_runs}
                                            {ws.run_spike !== null && (
                                                <span className="ml-1 text-[10px]">({ws.run_spike}x)</span>
                                            )}
                                        </td>
                                        <td className={cn(
                                            'px-4 py-3 text-right tabular-nums text-xs',
                                            ws.cost_spike !== null && ws.cost_spike >= SPIKE_THRESHOLD ? 'text-orange-400 font-bold' : 'text-gray-400',
                                        )}>
                                            ${ws.prev_cost.toFixed(2)} → ${ws.curr_cost.toFixed(2)}
                                            {ws.cost_spike !== null && (
                                                <span className="ml-1 text-[10px]">({ws.cost_spike}x)</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={cn(
                                                'rounded px-1.5 py-0.5 text-[10px] font-bold',
                                                peakSpike >= 5 ? 'text-red-400 bg-red-500/10'
                                                    : peakSpike >= 3 ? 'text-orange-400 bg-orange-500/10'
                                                        : 'text-amber-400 bg-amber-500/10',
                                            )}>
                                                {peakSpike}x
                                            </span>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

// ─── Key Rotation Alerts Sub-section ────────────────────────────────────────

function KeyRotationSection({ days }: { days: number }) {
    const { data: alerts, isLoading } = useKeyRotationAlerts(days)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            </div>
        )
    }

    const entries = alerts ?? []

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-gray-200">API Key Activity</h3>
                <span className="text-xs text-gray-500">
                    Workspaces with 3+ key operations in the last {days}d
                </span>
            </div>

            {entries.length === 0 ? (
                <p className="rounded-lg border border-border bg-surface-card px-4 py-6 text-center text-sm text-gray-500">
                    No unusual key activity detected
                </p>
            ) : (
                <div className="rounded-xl border border-border bg-surface-card overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                <th className="px-4 py-3">Workspace</th>
                                <th className="px-4 py-3">Plan</th>
                                <th className="px-4 py-3 text-right">Created</th>
                                <th className="px-4 py-3 text-right">Rotated</th>
                                <th className="px-4 py-3 text-right">Deleted</th>
                                <th className="px-4 py-3 text-right">Total Ops</th>
                                <th className="px-4 py-3">Latest</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {entries.map((ws) => (
                                <tr key={ws.workspace_id} className={cn(
                                    'hover:bg-surface-raised/50',
                                    ws.total_key_ops >= 10 ? 'bg-violet-500/5' : '',
                                )}>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {ws.total_key_ops >= 10 && (
                                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                                            )}
                                            <span className="font-medium text-gray-200">{ws.workspace_name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={cn(
                                            'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                                            PLAN_COLORS[ws.plan] ?? PLAN_COLORS.free,
                                        )}>
                                            {ws.plan}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-gray-300">
                                        {ws.keys_created}
                                    </td>
                                    <td className={cn(
                                        'px-4 py-3 text-right tabular-nums',
                                        ws.keys_rotated >= 5 ? 'text-violet-400 font-bold' : 'text-gray-300',
                                    )}>
                                        {ws.keys_rotated}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-gray-300">
                                        {ws.keys_deleted}
                                    </td>
                                    <td className={cn(
                                        'px-4 py-3 text-right tabular-nums',
                                        ws.total_key_ops >= 10 ? 'text-violet-400 font-bold' : 'text-gray-300',
                                    )}>
                                        {ws.total_key_ops}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-400">
                                        {new Date(ws.latest_op_at).toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
