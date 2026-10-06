// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { X, Clock, User, Bot, AlertCircle, Loader2, Ban, Terminal, Play, RefreshCw, Wrench, ChevronDown, ChevronRight, CheckCircle2, XCircle } from 'lucide-react'
import { useTask } from '@/hooks/useTask'
import { useCancelTask } from '@/hooks/useCancelTask'
import { useDispatchTask } from '@/hooks/useDispatchTask'
import { useRerunTask } from '@/hooks/useRerunTask'
import { TaskStatusBadge, TaskPriorityBadge } from '@/components/tasks/TaskStatusBadge'
import { MarkdownContent } from '@/components/shared/MarkdownContent'
import { extractResultText } from '@/lib/markdown'
import { Skeleton } from '@/components/ui/skeleton'
import type { Agent } from '@/types'

interface TaskDetailPanelProps {
    taskId: string
    agents: Agent[]
    onClose: () => void
}

/**
 * Slide-in panel for viewing a single task.
 * Shows header, meta, description, output, and usage sections.
 */
export function TaskDetailPanel({ taskId, agents, onClose }: TaskDetailPanelProps) {
    const { task, isLoading, error } = useTask(taskId)
    const cancelMutation = useCancelTask()
    const dispatchMutation = useDispatchTask()
    const rerunMutation = useRerunTask()

    const agent = task ? agents.find((a) => a.id === task.assigned_agent_id) : null

    function handleCancel() {
        if (!task) return
        cancelMutation.mutate({ id: task.id, workspaceId: task.workspace_id })
    }

    function handleDispatch() {
        if (!task) return
        dispatchMutation.mutate({ id: task.id })
    }

    function handleRerun() {
        if (!task) return
        rerunMutation.mutate({ id: task.id, workspaceId: task.workspace_id })
    }

    const elapsed = task ? getElapsed(task.created_at, task.updated_at, task.status) : ''

    return (
        <div className="fixed inset-0 z-40 flex justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Panel */}
            <div className="relative w-full max-w-xl overflow-y-auto border-l border-border bg-surface-primary shadow-xl">
                {/* Close button */}
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-surface-elevated hover:text-gray-300"
                    aria-label="Close"
                >
                    <X className="h-5 w-5" />
                </button>

                {/* Loading */}
                {isLoading && (
                    <div className="p-6 space-y-4">
                        <Skeleton className="h-8 w-3/4" />
                        <Skeleton className="h-5 w-1/2" />
                        <Skeleton className="h-32 w-full rounded-lg" />
                        <Skeleton className="h-48 w-full rounded-lg" />
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="flex flex-col items-center justify-center p-16">
                        <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
                        <p className="text-sm text-gray-400">Failed to load task</p>
                    </div>
                )}

                {/* Task content */}
                {task && (
                    <div className="p-6">
                        {/* Header */}
                        <div className="mb-6 pr-8">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <TaskStatusBadge status={task.status} />
                                <TaskPriorityBadge priority={task.priority} />
                            </div>
                            <h2 className="text-xl font-semibold text-gray-100">{task.title}</h2>

                            {/* Action buttons */}
                            <div className="mt-3 flex items-center gap-2">
                                {/* Start Task button — visible for pending tasks with an agent */}
                                {task.status === 'pending' && task.assigned_agent_id && (
                                    <button
                                        type="button"
                                        onClick={handleDispatch}
                                        disabled={dispatchMutation.isPending}
                                        className="flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-600/20 disabled:opacity-50"
                                    >
                                        {dispatchMutation.isPending ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Play className="h-3.5 w-3.5" />
                                        )}
                                        Start Task
                                    </button>
                                )}

                                {/* Cancel button */}
                                {(task.status === 'running' || task.status === 'pending' || task.status === 'dispatched') && (
                                    <button
                                        type="button"
                                        onClick={handleCancel}
                                        disabled={cancelMutation.isPending}
                                        className="flex items-center gap-2 rounded-lg border border-red-600/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/10 disabled:opacity-50"
                                    >
                                        {cancelMutation.isPending ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Ban className="h-3.5 w-3.5" />
                                        )}
                                        Cancel Task
                                    </button>
                                )}

                                {/* Re-run button */}
                                {(task.status === 'failed' || task.status === 'completed' || task.status === 'cancelled') && (
                                    <button
                                        type="button"
                                        onClick={handleRerun}
                                        disabled={rerunMutation.isPending}
                                        className="flex items-center gap-2 rounded-lg border border-brand-primary/30 px-3 py-1.5 text-xs font-medium text-brand-primary transition-colors hover:bg-brand-primary/10 disabled:opacity-50"
                                    >
                                        {rerunMutation.isPending ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <RefreshCw className="h-3.5 w-3.5" />
                                        )}
                                        Re-run Task
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Meta */}
                        <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface-card p-4">
                            <MetaItem
                                icon={Bot}
                                label="Agent"
                                value={agent?.name ?? 'Unassigned'}
                            />
                            <MetaItem
                                icon={User}
                                label="Created by"
                                value="You"
                            />
                            <MetaItem
                                icon={Clock}
                                label="Created"
                                value={new Date(task.created_at).toLocaleString()}
                            />
                            <MetaItem
                                icon={Clock}
                                label="Duration"
                                value={elapsed}
                            />
                        </div>

                        {/* Description */}
                        {task.description && (
                            <div className="mb-6">
                                <h3 className="mb-2 text-sm font-medium text-gray-400">Description</h3>
                                <div className="rounded-lg border border-border bg-surface-card p-4 text-sm leading-relaxed text-gray-300 whitespace-pre-wrap">
                                    {task.description}
                                </div>
                            </div>
                        )}

                        {/* Output / Result */}
                        <div className="mb-6">
                            <h3 className="mb-2 text-sm font-medium text-gray-400">Output</h3>
                            {task.status === 'completed' && task.result ? (
                                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                                    <MarkdownContent content={extractResultText(task.result)} />
                                </div>
                            ) : task.status === 'failed' && task.error ? (
                                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                                    <p className="text-sm text-red-400">{task.error}</p>
                                </div>
                            ) : task.status === 'dispatched' ? (
                                <div className="flex items-center gap-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                                    <div>
                                        <p className="text-sm font-medium text-cyan-400">Dispatched</p>
                                        <p className="text-xs text-gray-500">Waiting for the Task Runner to pick up this task...</p>
                                    </div>
                                </div>
                            ) : task.status === 'running' ? (
                                <div className="flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                                    <div>
                                        <p className="text-sm font-medium text-blue-400">Processing...</p>
                                        <p className="text-xs text-gray-500">Output will stream here when the Task Runner is active.</p>
                                    </div>
                                </div>
                            ) : task.status === 'cancelled' ? (
                                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-card p-4">
                                    <Ban className="h-5 w-5 text-gray-500" />
                                    <p className="text-sm text-gray-500">Task was cancelled.</p>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-card p-4">
                                    <Terminal className="h-5 w-5 text-gray-600" />
                                    <p className="text-sm text-gray-500">Waiting to be dispatched...</p>
                                </div>
                            )}
                        </div>

                        {/* Tool Calls */}
                        {(() => {
                            const meta = task.metadata as Record<string, unknown> | null
                            const toolCalls = Array.isArray(meta?.tool_calls) ? meta.tool_calls as { tool: string; arguments: Record<string, unknown>; result: string; success: boolean; duration_ms: number }[] : []
                            const usage = meta?.usage as { totalTokens?: number; costEstimateUSD?: number; usageKnown?: boolean } | undefined

                            return (
                                <>
                                    {toolCalls.length > 0 && (
                                        <div className="mb-6">
                                            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-400">
                                                <Wrench className="h-4 w-4" />
                                                Tool Calls
                                                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                                                    {toolCalls.length}
                                                </span>
                                            </h3>
                                            <div className="space-y-2">
                                                {toolCalls.map((tc, i) => (
                                                    <ToolCallRow key={i} call={tc} />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Usage */}
                                    <div>
                                        <h3 className="mb-2 text-sm font-medium text-gray-400">Usage</h3>
                                        <div className="grid grid-cols-3 gap-3">
                                            <UsageStat label="Tokens" value={usage?.usageKnown === false ? 'Unknown' : usage?.totalTokens != null ? usage.totalTokens.toLocaleString() : '—'} />
                                            <UsageStat label="Cost" value={usage?.usageKnown === false ? 'Unknown' : usage?.costEstimateUSD != null ? `$${usage.costEstimateUSD.toFixed(4)}` : '—'} />
                                            <UsageStat label="Model" value={agent?.model ?? '—'} />
                                        </div>
                                    </div>
                                </>
                            )
                        })()}
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Helper Components ───────────────────────────────────────────────────────

function MetaItem({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
    return (
        <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-gray-600" />
            <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-sm text-gray-300">{value}</p>
            </div>
        </div>
    )
}

function UsageStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-border bg-surface-card px-3 py-2 text-center">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-sm font-medium text-gray-300">{value}</p>
        </div>
    )
}

function ToolCallRow({ call }: { call: { tool: string; arguments: Record<string, unknown>; result: string; success: boolean; duration_ms: number } }) {
    const [expanded, setExpanded] = useState(false)

    return (
        <div className="rounded-lg border border-border bg-surface-card">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-elevated"
            >
                {expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-500" />}
                {call.success
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    : <XCircle className="h-3.5 w-3.5 text-red-400" />
                }
                <span className="font-mono text-xs text-gray-200">{call.tool}</span>
                <span className="ml-auto rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-gray-500">
                    {call.duration_ms}ms
                </span>
            </button>
            {expanded && (
                <div className="border-t border-border px-3 py-2 space-y-2">
                    <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1">Arguments</p>
                        <pre className="rounded bg-surface-primary p-2 text-xs text-gray-400 overflow-x-auto">
                            {JSON.stringify(call.arguments, null, 2)}
                        </pre>
                    </div>
                    <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1">Result</p>
                        <pre className="rounded bg-surface-primary p-2 text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap">
                            {call.result}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    )
}

function getElapsed(createdAt: string, updatedAt: string, status: string): string {
    if (status === 'pending' || status === 'dispatched') return '—'
    const start = new Date(createdAt).getTime()
    const end = status === 'running' ? Date.now() : new Date(updatedAt).getTime()
    const seconds = Math.round((end - start) / 1000)
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    return `${(seconds / 3600).toFixed(1)}h`
}
