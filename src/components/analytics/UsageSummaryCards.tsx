// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { Hash, Coins, ListTodo, GitBranch } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { UsageSummary } from '@/db/usage'

interface UsageSummaryCardsProps {
    summary: UsageSummary | undefined
    isLoading: boolean
}

/**
 * Row of 4 usage summary cards — total tokens, total cost, task runs, team runs.
 */
export function UsageSummaryCards({ summary, isLoading }: UsageSummaryCardsProps) {
    const cards = [
        {
            label: 'Total Tokens Used',
            value: summary?.totalTokens.toLocaleString() ?? '0',
            icon: Hash,
            color: 'text-purple-400',
            bg: 'bg-purple-500/10',
        },
        {
            label: 'Total Cost',
            value: summary ? `$${summary.totalCostUsd.toFixed(4)}` : '$0.0000',
            icon: Coins,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
        },
        {
            label: 'Task Executions',
            value: summary?.taskExecutions.toLocaleString() ?? '0',
            icon: ListTodo,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
        },
        {
            label: 'Team Runs',
            value: summary?.teamRuns.toLocaleString() ?? '0',
            icon: GitBranch,
            color: 'text-green-400',
            bg: 'bg-green-500/10',
        },
    ]

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => {
                if (isLoading) {
                    return (
                        <div key={card.label} className="rounded-lg border border-border bg-surface-card p-4">
                            <Skeleton className="mb-2 h-4 w-24" />
                            <Skeleton className="h-7 w-16" />
                        </div>
                    )
                }

                const Icon = card.icon
                return (
                    <div
                        key={card.label}
                        className="rounded-lg border border-border bg-surface-card p-4 transition-all hover:shadow-sm"
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs font-medium text-gray-500">{card.label}</p>
                            <div className={`flex h-7 w-7 items-center justify-center rounded-md ${card.bg}`}>
                                <Icon className={`h-3.5 w-3.5 ${card.color}`} />
                            </div>
                        </div>
                        <p className="text-xl font-bold text-gray-100">{card.value}</p>
                    </div>
                )
            })}
        </div>
    )
}
