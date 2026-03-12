// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useAgents } from '@/hooks/useAgents'
import { useTask } from '@/hooks/useTask'
import { useCancelTask } from '@/hooks/useCancelTask'
import { useRerunTask } from '@/hooks/useRerunTask'
import { useTaskAttachments } from '@/hooks/useAttachments'
import { TaskStatusBadge, TaskPriorityBadge } from '@/components/tasks/TaskStatusBadge'
import { FileAttachmentsList } from '@/components/shared/FileAttachmentsList'
import { MarkdownContent } from '@/components/shared/MarkdownContent'
import { extractResultText } from '@/lib/markdown'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Ban, Terminal, Clock, User, Bot, RefreshCw } from 'lucide-react'

/**
 * Full-page view of a single task at /tasks/:id.
 * Mirror of TaskDetailPanel logic but as a standalone page.
 */
export function TaskDetail() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { workspaceId } = useWorkspace()
    const { agents } = useAgents(workspaceId)
    const { task, isLoading, error } = useTask(id ?? null)
    const { data: attachments } = useTaskAttachments(id ?? undefined)
    const cancelMutation = useCancelTask()
    const rerunMutation = useRerunTask()

    const agent = task ? agents.find((a) => a.id === task.assigned_agent_id) : null

    function handleCancel() {
        if (!task) return
        cancelMutation.mutate({ id: task.id, workspaceId: task.workspace_id })
    }

    function handleRerun() {
        if (!task) return
        rerunMutation.mutate({ id: task.id, workspaceId: task.workspace_id })
    }

    const elapsed = task ? getElapsed(task.created_at, task.updated_at, task.status) : ''

    return (
        <div className="p-6 lg:p-8">
            {/* Back */}
            <button
                type="button"
                onClick={() => navigate('/tasks')}
                className="mb-4 flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-300"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Tasks
            </button>

            {/* Loading */}
            {isLoading && (
                <div className="space-y-4">
                    <Skeleton className="h-10 w-1/2" />
                    <Skeleton className="h-6 w-1/3" />
                    <Skeleton className="h-40 w-full rounded-lg" />
                    <Skeleton className="h-60 w-full rounded-lg" />
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="flex flex-col items-center justify-center py-16">
                    <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
                    <p className="text-sm text-gray-400">Failed to load task</p>
                </div>
            )}

            {/* Content */}
            {task && (
                <div className="mx-auto max-w-3xl">
                    {/* Header */}
                    <div className="mb-6">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            <TaskStatusBadge status={task.status} />
                            <TaskPriorityBadge priority={task.priority} />
                        </div>
                        <h1 className="text-2xl font-semibold text-gray-100">{task.title}</h1>

                        {(task.status === 'running' || task.status === 'pending') && (
                            <button
                                type="button"
                                onClick={handleCancel}
                                disabled={cancelMutation.isPending}
                                className="mt-3 flex items-center gap-2 rounded-lg border border-red-600/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/10 disabled:opacity-50"
                            >
                                {cancelMutation.isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Ban className="h-3.5 w-3.5" />
                                )}
                                Cancel Task
                            </button>
                        )}

                        {(task.status === 'failed' || task.status === 'completed' || task.status === 'cancelled') && (
                            <button
                                type="button"
                                onClick={handleRerun}
                                disabled={rerunMutation.isPending}
                                className="mt-3 flex items-center gap-2 rounded-lg border border-brand-primary/30 px-3 py-1.5 text-xs font-medium text-brand-primary transition-colors hover:bg-brand-primary/10 disabled:opacity-50"
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

                    {/* Meta */}
                    <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-border bg-surface-card p-4 sm:grid-cols-4">
                        <MetaItem icon={Bot} label="Agent" value={agent?.name ?? 'Unassigned'} />
                        <MetaItem icon={User} label="Created by" value="You" />
                        <MetaItem icon={Clock} label="Created" value={new Date(task.created_at).toLocaleString()} />
                        <MetaItem icon={Clock} label="Duration" value={elapsed} />
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

                    {/* Output */}
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

                    {/* Attachments */}
                    {attachments && attachments.length > 0 && (
                        <div className="mb-6">
                            <h3 className="mb-2 text-sm font-medium text-gray-400">Files</h3>
                            <FileAttachmentsList
                                attachments={attachments}
                                canDelete
                                queryKey={['attachments', 'task', id]}
                            />
                        </div>
                    )}

                    {/* Usage */}
                    <div>
                        <h3 className="mb-2 text-sm font-medium text-gray-400">Usage</h3>
                        <div className="grid grid-cols-3 gap-3">
                            <UsageStat label="Tokens" value="—" />
                            <UsageStat label="Cost" value="—" />
                            <UsageStat label="Model" value={agent?.model ?? '—'} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

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

function getElapsed(createdAt: string, updatedAt: string, status: string): string {
    if (status === 'pending') return '—'
    const start = new Date(createdAt).getTime()
    const end = status === 'running' ? Date.now() : new Date(updatedAt).getTime()
    const seconds = Math.round((end - start) / 1000)
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    return `${(seconds / 3600).toFixed(1)}h`
}
