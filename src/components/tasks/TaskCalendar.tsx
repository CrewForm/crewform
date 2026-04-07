// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useTasksQuery } from '@/hooks/useTasksQuery'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus } from '@/types'

// ─── Constants ──────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const STATUS_COLORS: Record<TaskStatus, string> = {
    pending: 'bg-yellow-400',
    dispatched: 'bg-blue-400',
    running: 'bg-purple-400',
    waiting_for_input: 'bg-amber-400',
    completed: 'bg-green-400',
    failed: 'bg-red-400',
    cancelled: 'bg-gray-500',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function formatDate(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function getMonthLabel(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** Get all calendar cells (including padding days from prev/next month) */
function getCalendarDays(year: number, month: number): Date[] {
    const first = new Date(year, month, 1)
    const last = new Date(year, month + 1, 0)

    // Monday = 0, so shift Sunday from 0 to 6
    const startDow = (first.getDay() + 6) % 7

    const days: Date[] = []

    // Padding from previous month
    for (let i = startDow - 1; i >= 0; i--) {
        days.push(new Date(year, month, -i))
    }

    // Current month
    for (let d = 1; d <= last.getDate(); d++) {
        days.push(new Date(year, month, d))
    }

    // Padding to fill 6 rows (42 cells) or at least complete the row
    while (days.length % 7 !== 0) {
        days.push(new Date(year, month + 1, days.length - last.getDate() - startDow + 1))
    }

    return days
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface TaskCalendarProps {
    onSelectDate: (date: string) => void
    onSelectTask: (taskId: string) => void
}

export function TaskCalendar({ onSelectDate, onSelectTask }: TaskCalendarProps) {
    const { workspaceId } = useWorkspace()
    const [viewDate, setViewDate] = useState(() => new Date())

    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()

    const dateFrom = formatDate(startOfMonth(viewDate))
    const dateTo = formatDate(endOfMonth(viewDate))

    const { tasks, isLoading } = useTasksQuery(workspaceId, {
        dateFrom,
        dateTo,
    })

    const today = formatDate(new Date())
    const days = useMemo(() => getCalendarDays(year, month), [year, month])

    // Group tasks by scheduled_for date (extract date from ISO timestamp)
    const tasksByDate = useMemo(() => {
        const map = new Map<string, Task[]>()
        for (const task of tasks) {
            if (!task.scheduled_for) continue
            // Extract YYYY-MM-DD from ISO timestamp
            const key = task.scheduled_for.substring(0, 10)
            const existing = map.get(key)
            if (existing) {
                existing.push(task)
            } else {
                map.set(key, [task])
            }
        }
        return map
    }, [tasks])

    function prevMonth() {
        setViewDate(new Date(year, month - 1, 1))
    }

    function nextMonth() {
        setViewDate(new Date(year, month + 1, 1))
    }

    function goToToday() {
        setViewDate(new Date())
    }

    return (
        <div className="rounded-lg border border-border bg-surface-card">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={prevMonth}
                        className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-surface-raised hover:text-gray-300"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <h3 className="min-w-[160px] text-center text-sm font-semibold text-gray-200">
                        {getMonthLabel(viewDate)}
                    </h3>
                    <button
                        type="button"
                        onClick={nextMonth}
                        className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-surface-raised hover:text-gray-300"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
                <button
                    type="button"
                    onClick={goToToday}
                    className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-raised hover:text-gray-200"
                >
                    Today
                </button>
            </div>

            {/* Loading overlay */}
            {isLoading && (
                <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                </div>
            )}

            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-border">
                {WEEKDAYS.map((day) => (
                    <div
                        key={day}
                        className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-600"
                    >
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7">
                {days.map((day, i) => {
                    const dateStr = formatDate(day)
                    const isCurrentMonth = day.getMonth() === month
                    const isToday = dateStr === today
                    const dayTasks = tasksByDate.get(dateStr) ?? []

                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => {
                                if (dayTasks.length === 0) {
                                    onSelectDate(dateStr)
                                }
                            }}
                            className={cn(
                                'relative flex min-h-[80px] flex-col border-b border-r border-border/50 p-1.5 text-left transition-colors',
                                isCurrentMonth
                                    ? 'hover:bg-surface-raised'
                                    : 'opacity-40',
                                i % 7 === 0 && 'border-l-0',
                            )}
                        >
                            {/* Date number */}
                            <span
                                className={cn(
                                    'mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                                    isToday
                                        ? 'bg-brand-primary text-black'
                                        : isCurrentMonth
                                            ? 'text-gray-300'
                                            : 'text-gray-600',
                                )}
                            >
                                {day.getDate()}
                            </span>

                            {/* Task dots */}
                            <div className="flex flex-col gap-0.5 overflow-hidden">
                                {dayTasks.slice(0, 3).map((task) => (
                                    <div
                                        key={task.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onSelectTask(task.id)
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.stopPropagation()
                                                onSelectTask(task.id)
                                            }
                                        }}
                                        className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-surface-elevated"
                                    >
                                        <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', STATUS_COLORS[task.status])} />
                                        <span className="truncate text-[10px] text-gray-400">{task.title}</span>
                                    </div>
                                ))}
                                {dayTasks.length > 3 && (
                                    <span className="px-1 text-[10px] text-gray-600">
                                        +{dayTasks.length - 3} more
                                    </span>
                                )}
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
