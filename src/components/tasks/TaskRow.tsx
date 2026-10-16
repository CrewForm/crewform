// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { Play, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { TaskStatusBadge, TaskPriorityBadge } from '@/components/tasks/TaskStatusBadge'
import { useDispatchTask } from '@/hooks/useDispatchTask'
import { useRerunTask } from '@/hooks/useRerunTask'
import { useDeleteTask } from '@/hooks/useDeleteTask'
import type { Task, Agent } from '@/types'

interface TaskRowProps {
    task: Task
    agents: Agent[]
    onClick?: () => void
}

/**
 * Table row for the task list.
 * Status · Title · Agent · Priority · Created · Elapsed · Actions
 */
export function TaskRow({ task, agents, onClick }: TaskRowProps) {
    const agent = agents.find((a) => a.id === task.assigned_agent_id)
    const dispatchMutation = useDispatchTask()
    const rerunMutation = useRerunTask()
    const deleteMutation = useDeleteTask()

    const elapsed = getElapsedText(task)
    const canRerun = task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'

    function handleStart(e: React.MouseEvent) {
        e.stopPropagation()
        dispatchMutation.mutate({ id: task.id })
    }

    function handleRerun(e: React.MouseEvent) {
        e.stopPropagation()
        rerunMutation.mutate({ id: task.id, workspaceId: task.workspace_id })
    }

    function handleDelete(e: React.MouseEvent) {
        e.stopPropagation()
        if (!confirm('Delete this task? This cannot be undone.')) return
        deleteMutation.mutate({ id: task.id, workspaceId: task.workspace_id })
    }

    return (
        <tr
            className="border-b border-border-muted transition-colors hover:bg-surface-elevated/50 cursor-pointer"
            onClick={onClick}
        >
            {/* Status */}
            <td className="px-4 py-3">
                <TaskStatusBadge status={task.status} />
            </td>

            {/* Title */}
            <td className="px-4 py-3">
                <span className="text-sm font-medium text-gray-200">{task.title}</span>
                {task.description && (
                    <p className="mt-0.5 max-w-md truncate text-xs text-gray-500">
                        {task.description}
                    </p>
                )}
            </td>

            {/* Agent */}
            <td className="px-4 py-3">
                {agent ? (
                    <span className="text-sm text-gray-400">{agent.name}</span>
                ) : (
                    <span className="text-sm text-gray-600">Unassigned</span>
                )}
            </td>

            {/* Priority */}
            <td className="px-4 py-3">
                <TaskPriorityBadge priority={task.priority} />
            </td>

            {/* Created */}
            <td className="px-4 py-3">
                <span className="text-xs text-gray-500">
                    {new Date(task.created_at).toLocaleDateString()}
                </span>
            </td>

            {/* Elapsed */}
            <td className="px-4 py-3">
                <span className="text-xs text-gray-500">{elapsed}</span>
            </td>

            {/* Actions */}
            <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                    {/* Start (pending only) */}
                    {task.status === 'pending' && task.assigned_agent_id && (
                        <button
                            type="button"
                            onClick={handleStart}
                            disabled={dispatchMutation.isPending}
                            title="Start task"
                            className="flex items-center gap-1.5 rounded-md border border-green-600/30 bg-green-600/10 px-2.5 py-1 text-xs font-medium text-green-400 transition-colors hover:bg-green-600/20 disabled:opacity-50"
                        >
                            {dispatchMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <Play className="h-3 w-3" />
                            )}
                            Start
                        </button>
                    )}

                    {/* Rerun (completed/failed/cancelled) */}
                    {canRerun && (
                        <button
                            type="button"
                            onClick={handleRerun}
                            disabled={rerunMutation.isPending}
                            title="Re-run task"
                            className="flex items-center gap-1.5 rounded-md border border-blue-600/30 bg-blue-600/10 px-2.5 py-1 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-600/20 disabled:opacity-50"
                        >
                            {rerunMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <RefreshCw className="h-3 w-3" />
                            )}
                            Rerun
                        </button>
                    )}

                    {/* Delete */}
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleteMutation.isPending}
                        title="Delete task"
                        className="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                    >
                        {deleteMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>
            </td>
        </tr>
    )
}

function getElapsedText(task: Task): string {
    if (task.status === 'pending' || task.status === 'dispatched') return '—'

    const start = new Date(task.created_at).getTime()
    const end = task.status === 'running'
        ? Date.now()
        : new Date(task.updated_at).getTime()

    const seconds = Math.round((end - start) / 1000)

    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    return `${Math.round(seconds / 3600)}h`
}
