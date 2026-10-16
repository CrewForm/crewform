// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { Link } from 'react-router-dom'
import {
    CheckCircle2,
    XCircle,
    Loader2,
    Clock,
    Play,
    ListTodo,
    GitBranch,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { ActivityItem } from '@/db/dashboard'

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
    pending: Clock,
    dispatched: Play,
    running: Loader2,
    completed: CheckCircle2,
    failed: XCircle,
    cancelled: XCircle,
}

const STATUS_COLOR: Record<string, string> = {
    pending: 'text-gray-400',
    dispatched: 'text-cyan-400',
    running: 'text-blue-400',
    completed: 'text-green-400',
    failed: 'text-red-400',
    cancelled: 'text-gray-500',
}

interface ActivityTimelineProps {
    activity: ActivityItem[]
    isLoading: boolean
}

/**
 * Activity timeline — recent tasks and team runs merged in a scrollable list.
 */
export function ActivityTimeline({ activity, isLoading }: ActivityTimelineProps) {
    if (isLoading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
            </div>
        )
    }

    if (activity.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-center">
                <ListTodo className="mb-2 h-8 w-8 text-gray-600" />
                <p className="text-sm text-gray-500">No activity yet</p>
                <p className="text-xs text-gray-600 mt-1">Tasks and team runs will appear here.</p>
            </div>
        )
    }

    return (
        <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
            {activity.map((item) => {
                if (item.type === 'task') {
                    const t = item.data
                    const TaskIcon = STATUS_ICON[t.status] ?? Clock
                    const taskColor = STATUS_COLOR[t.status] ?? 'text-gray-400'
                    return (
                        <Link
                            key={`task-${t.id}`}
                            to={`/tasks/${t.id}`}
                            className="flex items-center gap-3 rounded-lg border border-border/50 bg-surface-card/50 px-3 py-2.5 transition-all hover:border-brand-primary/30 hover:bg-surface-elevated/30"
                        >
                            <TaskIcon className={cn('h-4 w-4 flex-shrink-0', taskColor, t.status === 'running' && 'animate-spin')} />
                            <div className="flex-1 min-w-0">
                                <p className="truncate text-sm text-gray-200">{t.title}</p>
                            </div>
                            <span className="flex-shrink-0 text-[10px] text-gray-600">
                                {relativeTime(t.updated_at)}
                            </span>
                        </Link>
                    )
                }

                const r = item.data
                const runColor = STATUS_COLOR[r.status] ?? 'text-gray-400'
                return (
                    <Link
                        key={`run-${r.id}`}
                        to={`/teams/${r.team_id}/runs/${r.id}`}
                        className="flex items-center gap-3 rounded-lg border border-border/50 bg-surface-card/50 px-3 py-2.5 transition-all hover:border-brand-primary/30 hover:bg-surface-elevated/30"
                    >
                        <GitBranch className={cn('h-4 w-4 flex-shrink-0', runColor)} />
                        <div className="flex-1 min-w-0">
                            <p className="truncate text-sm text-gray-200">{r.input_task}</p>
                        </div>
                        <span className="flex-shrink-0 text-[10px] text-gray-600">
                            {relativeTime(r.updated_at)}
                        </span>
                    </Link>
                )
            })}
        </div>
    )
}

function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
}
