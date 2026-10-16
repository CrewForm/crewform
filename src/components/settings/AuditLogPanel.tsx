// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useState, useCallback } from 'react'
import {
    ScrollText, Loader2, UserPlus, UserMinus, ShieldCheck,
    Settings2, Bot, ListTodo, GitBranch, Play,
    CheckCircle2, XCircle, Download, ChevronDown,
    Filter, Calendar,
} from 'lucide-react'
import { useAuditLog } from '@/hooks/useMembers'
import type { AuditLogEntry, AuditLogFilters } from '@/db/members'
import { useWorkspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/utils'


const ACTION_META: Record<string, { icon: typeof UserPlus; color: string; label: string }> = {
    member_invited: { icon: UserPlus, color: 'text-blue-400', label: 'Member Invited' },
    member_joined: { icon: UserPlus, color: 'text-green-400', label: 'Member Joined' },
    member_removed: { icon: UserMinus, color: 'text-red-400', label: 'Member Removed' },
    role_changed: { icon: ShieldCheck, color: 'text-amber-400', label: 'Role Changed' },
    workspace_updated: { icon: Settings2, color: 'text-purple-400', label: 'Workspace Updated' },
    agent_created: { icon: Bot, color: 'text-cyan-400', label: 'Agent Created' },
    agent_updated: { icon: Bot, color: 'text-cyan-400', label: 'Agent Updated' },
    agent_deleted: { icon: Bot, color: 'text-red-400', label: 'Agent Deleted' },
    task_created: { icon: ListTodo, color: 'text-green-400', label: 'Task Created' },
    task_completed: { icon: ListTodo, color: 'text-green-400', label: 'Task Completed' },
    // Team events
    team_created: { icon: GitBranch, color: 'text-cyan-400', label: 'Team Created' },
    team_updated: { icon: GitBranch, color: 'text-amber-400', label: 'Team Updated' },
    team_deleted: { icon: GitBranch, color: 'text-red-400', label: 'Team Deleted' },
    team_run_started: { icon: Play, color: 'text-blue-400', label: 'Team Run Started' },
    team_run_completed: { icon: CheckCircle2, color: 'text-green-400', label: 'Team Run Completed' },
    team_run_failed: { icon: XCircle, color: 'text-red-400', label: 'Team Run Failed' },
}

const DEFAULT_META = { icon: ScrollText, color: 'text-gray-400', label: 'Event' }

const DATE_RANGE_OPTIONS: { value: AuditLogFilters['dateRange']; label: string }[] = [
    { value: 'all', label: 'All time' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
]

const PAGE_SIZE = 50

// ─── Export helpers ──────────────────────────────────────────────────────────

function exportJson(logs: AuditLogEntry[]) {
    const json = JSON.stringify(logs, null, 2)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `crewform-audit-log.json`
    link.click()
    URL.revokeObjectURL(url)
}

function exportCsv(logs: AuditLogEntry[]) {
    const headers = ['Date', 'Action', 'Label', 'Details']
    const lines = [headers.join(',')]

    for (const entry of logs) {
        const meta = ACTION_META[entry.action] ?? DEFAULT_META
        const details = Object.entries(entry.details)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join('; ')
        lines.push([
            new Date(entry.created_at).toISOString(),
            entry.action,
            `"${meta.label}"`,
            `"${details.replace(/"/g, '""')}"`,
        ].join(','))
    }

    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `crewform-audit-log.csv`
    link.click()
    URL.revokeObjectURL(url)
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AuditLogPanel() {
    const { workspaceId } = useWorkspace()
    const [actionFilter, setActionFilter] = useState<string>('')
    const [dateRange, setDateRange] = useState<AuditLogFilters['dateRange']>('all')
    const [offset, setOffset] = useState(0)
    const [allLogs, setAllLogs] = useState<AuditLogEntry[]>([])
    const [exportFormat, setExportFormat] = useState<'json' | 'csv' | null>(null)

    const filters: AuditLogFilters = {
        action: actionFilter || undefined,
        dateRange,
        offset,
        limit: PAGE_SIZE,
    }

    const { data: logs, isLoading } = useAuditLog(workspaceId, filters)

    // Merge pages for "Load more"
    const displayedLogs = offset === 0 ? (logs ?? []) : [...allLogs, ...(logs ?? [])]

    const handleFilterChange = useCallback((newAction: string, newDateRange: AuditLogFilters['dateRange']) => {
        setActionFilter(newAction)
        setDateRange(newDateRange)
        setOffset(0)
        setAllLogs([])
    }, [])

    function handleLoadMore() {
        // Save current logs before loading next page
        setAllLogs(displayedLogs)
        setOffset(displayedLogs.length)
    }

    function handleExport(format: 'json' | 'csv') {
        if (displayedLogs.length === 0) return
        setExportFormat(format)
        try {
            if (format === 'json') exportJson(displayedLogs)
            else exportCsv(displayedLogs)
        } finally {
            setTimeout(() => setExportFormat(null), 500)
        }
    }

    if (isLoading && offset === 0) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Filters & Export toolbar */}
            <div className="flex flex-wrap items-center gap-2">
                {/* Action filter */}
                <div className="relative">
                    <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                    <select
                        value={actionFilter}
                        onChange={(e) => handleFilterChange(e.target.value, dateRange)}
                        className="h-8 appearance-none rounded-lg border border-border bg-surface-raised pl-8 pr-8 text-xs text-gray-300 outline-none transition-colors hover:border-border-hover focus:ring-1 focus:ring-brand-primary/50"
                    >
                        <option value="">All actions</option>
                        {Object.entries(ACTION_META).map(([key, meta]) => (
                            <option key={key} value={key}>{meta.label}</option>
                        ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                </div>

                {/* Date range filter */}
                <div className="relative">
                    <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                    <select
                        value={dateRange}
                        onChange={(e) => handleFilterChange(actionFilter, e.target.value as AuditLogFilters['dateRange'])}
                        className="h-8 appearance-none rounded-lg border border-border bg-surface-raised pl-8 pr-8 text-xs text-gray-300 outline-none transition-colors hover:border-border-hover focus:ring-1 focus:ring-brand-primary/50"
                    >
                        {DATE_RANGE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => handleExport('json')}
                        disabled={exportFormat !== null || displayedLogs.length === 0}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200 disabled:opacity-50"
                    >
                        {exportFormat === 'json' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Download className="h-3.5 w-3.5" />
                        )}
                        JSON
                    </button>
                    <button
                        type="button"
                        onClick={() => handleExport('csv')}
                        disabled={exportFormat !== null || displayedLogs.length === 0}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200 disabled:opacity-50"
                    >
                        {exportFormat === 'csv' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Download className="h-3.5 w-3.5" />
                        )}
                        CSV
                    </button>
                </div>
            </div>

            {/* Empty state */}
            {displayedLogs.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-card py-16">
                    <ScrollText className="mb-4 h-10 w-10 text-gray-600" />
                    <h3 className="mb-1 text-lg font-medium text-gray-300">
                        {actionFilter || dateRange !== 'all' ? 'No matching events' : 'No audit events yet'}
                    </h3>
                    <p className="text-sm text-gray-500">
                        {actionFilter || dateRange !== 'all'
                            ? 'Try adjusting your filters.'
                            : 'Activity in this workspace will be recorded here.'}
                    </p>
                </div>
            )}

            {/* Log entries */}
            {displayedLogs.length > 0 && (
                <div className="rounded-lg border border-border bg-surface-card divide-y divide-border/50">
                    {displayedLogs.map((entry) => {
                        const meta = ACTION_META[entry.action] ?? DEFAULT_META
                        const Icon = meta.icon

                        return (
                            <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                                <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-raised ${meta.color}`}>
                                    <Icon className="h-3.5 w-3.5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-gray-200">{meta.label}</p>
                                    {Object.keys(entry.details).length > 0 && (
                                        <p className="mt-0.5 text-xs text-gray-500">
                                            {Object.entries(entry.details)
                                                .map(([k, v]) => `${k}: ${String(v)}`)
                                                .join(' · ')}
                                        </p>
                                    )}
                                </div>
                                <span className="shrink-0 text-xs text-gray-600">
                                    {new Date(entry.created_at).toLocaleString()}
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Load more */}
            {(logs?.length ?? 0) >= PAGE_SIZE && (
                <div className="flex justify-center">
                    <button
                        type="button"
                        onClick={handleLoadMore}
                        disabled={isLoading}
                        className={cn(
                            'flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-gray-400 transition-colors',
                            'hover:bg-surface-elevated hover:text-gray-200 disabled:opacity-50',
                        )}
                    >
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <ChevronDown className="h-4 w-4" />
                        )}
                        Load more
                    </button>
                </div>
            )}
        </div>
    )
}
