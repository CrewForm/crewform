// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { cn } from '@/lib/utils'
import type { TaskStatus, TaskPriority } from '@/types'

const STATUS_CONFIG: Record<TaskStatus, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
    dispatched: { label: 'Dispatched', className: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 animate-pulse' },
    running: { label: 'Running', className: 'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse' },
    waiting_for_input: { label: 'Waiting', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse' },
    completed: { label: 'Completed', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
    failed: { label: 'Failed', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
    cancelled: { label: 'Cancelled', className: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
    low: { label: 'Low', className: 'bg-gray-500/10 text-gray-400' },
    medium: { label: 'Medium', className: 'bg-yellow-500/10 text-yellow-400' },
    high: { label: 'High', className: 'bg-orange-500/10 text-orange-400' },
    urgent: { label: 'Urgent', className: 'bg-red-500/10 text-red-400' },
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
    const config = STATUS_CONFIG[status]
    return (
        <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', config.className)}>
            {config.label}
        </span>
    )
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
    const config = PRIORITY_CONFIG[priority]
    return (
        <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', config.className)}>
            {config.label}
        </span>
    )
}
