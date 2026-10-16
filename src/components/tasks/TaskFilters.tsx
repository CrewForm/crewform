// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { Search, X } from 'lucide-react'
import type { Agent } from '@/types'
import type { TaskStatus, TaskPriority } from '@/types'

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'dispatched', label: 'Dispatched' },
    { value: 'running', label: 'Running' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' },
]

interface TaskFiltersProps {
    search: string
    onSearchChange: (value: string) => void
    statusFilter: TaskStatus[]
    onStatusChange: (statuses: TaskStatus[]) => void
    priorityFilter: TaskPriority[]
    onPriorityChange: (priorities: TaskPriority[]) => void
    agentFilter: string
    onAgentChange: (agentId: string) => void
    agents: Agent[]
}

/**
 * Filter bar for the task list.
 * Search, status multi-select, priority, and agent dropdown.
 */
export function TaskFilters({
    search,
    onSearchChange,
    statusFilter,
    onStatusChange,
    priorityFilter,
    onPriorityChange,
    agentFilter,
    onAgentChange,
    agents,
}: TaskFiltersProps) {
    const hasAnyFilter = search || statusFilter.length > 0 || priorityFilter.length > 0 || agentFilter

    function toggleStatus(status: TaskStatus) {
        if (statusFilter.includes(status)) {
            onStatusChange(statusFilter.filter((s) => s !== status))
        } else {
            onStatusChange([...statusFilter, status])
        }
    }

    function togglePriority(priority: TaskPriority) {
        if (priorityFilter.includes(priority)) {
            onPriorityChange(priorityFilter.filter((p) => p !== priority))
        } else {
            onPriorityChange([...priorityFilter, priority])
        }
    }

    function clearAll() {
        onSearchChange('')
        onStatusChange([])
        onPriorityChange([])
        onAgentChange('')
    }

    return (
        <div className="mb-4 space-y-3">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search tasks..."
                    className="w-full rounded-lg border border-border bg-surface-card py-2 pl-10 pr-4 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary"
                />
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap items-center gap-2">
                {/* Status pills */}
                {STATUS_OPTIONS.map(({ value, label }) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => toggleStatus(value)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${statusFilter.includes(value)
                            ? 'border-brand-primary bg-brand-muted text-brand-primary'
                            : 'border-border text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        {label}
                    </button>
                ))}

                {/* Separator */}
                <div className="h-4 w-px bg-border" />

                {/* Priority pills */}
                {PRIORITY_OPTIONS.map(({ value, label }) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => togglePriority(value)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${priorityFilter.includes(value)
                            ? 'border-brand-primary bg-brand-muted text-brand-primary'
                            : 'border-border text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        {label}
                    </button>
                ))}

                {/* Separator */}
                <div className="h-4 w-px bg-border" />

                {/* Agent dropdown */}
                <select
                    value={agentFilter}
                    onChange={(e) => onAgentChange(e.target.value)}
                    className="rounded-lg border border-border bg-surface-card px-3 py-1 text-xs text-gray-400 outline-none focus:border-brand-primary"
                >
                    <option value="">All agents</option>
                    {agents.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>

                {/* Clear all */}
                {hasAnyFilter && (
                    <button
                        type="button"
                        onClick={clearAll}
                        className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-gray-500 hover:text-gray-300"
                    >
                        <X className="h-3 w-3" />
                        Clear
                    </button>
                )}
            </div>
        </div>
    )
}
