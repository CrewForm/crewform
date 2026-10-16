// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { Clock, TrendingUp, Zap } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { TimeSavedData } from '@/db/analytics'

interface TimeSavedCardProps {
    data: TimeSavedData | undefined
    isLoading: boolean
}

function formatMinutes(minutes: number): string {
    if (minutes < 1) return `${Math.round(minutes * 60)}s`
    if (minutes < 60) return `${minutes.toFixed(1)}m`
    const hours = Math.floor(minutes / 60)
    const remaining = Math.round(minutes % 60)
    return `${hours}h ${remaining}m`
}

/**
 * Card showing estimated time saved by agent automation vs manual work.
 */
export function TimeSavedCard({ data, isLoading }: TimeSavedCardProps) {
    if (isLoading) {
        return (
            <div className="rounded-xl border border-border bg-surface-card p-5">
                <Skeleton className="mb-3 h-5 w-32" />
                <Skeleton className="mb-2 h-8 w-24" />
                <Skeleton className="h-4 w-full" />
            </div>
        )
    }

    const agentMin = data?.agentMinutes ?? 0
    const manualMin = data?.manualEstimate ?? 0
    const savedMin = data?.timeSavedMinutes ?? 0
    const taskCount = data?.taskCount ?? 0
    const avgSec = data?.avgSecondsPerTask ?? 0

    // Progress bar width: agent time as % of manual estimate
    const barPct = manualMin > 0 ? Math.min((agentMin / manualMin) * 100, 100) : 0

    return (
        <div className="rounded-xl border border-border bg-surface-card p-5">
            <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                    Time Saved
                </h3>
            </div>

            {taskCount === 0 ? (
                <p className="text-sm text-gray-500">No completed tasks in this range</p>
            ) : (
                <>
                    {/* Big number */}
                    <p className="mb-3 text-3xl font-bold text-emerald-400">
                        {formatMinutes(savedMin)}
                        <span className="ml-2 text-sm font-normal text-gray-500">saved</span>
                    </p>

                    {/* Bar visualization */}
                    <div className="mb-3 space-y-1">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>Agent: {formatMinutes(agentMin)}</span>
                            <span>Manual est: {formatMinutes(manualMin)}</span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-surface-raised">
                            <div
                                className="h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                                style={{ width: `${barPct}%` }}
                            />
                        </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                            <Zap className="h-3 w-3 text-yellow-400" />
                            <span>{taskCount} tasks</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-blue-400" />
                            <span>Avg {avgSec.toFixed(1)}s/task</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
