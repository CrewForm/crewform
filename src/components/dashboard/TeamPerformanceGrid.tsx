// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { GitBranch, CheckCircle2, XCircle, Coins, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { TeamPerformanceRow } from '@/db/dashboard'

interface TeamPerformanceGridProps {
    teams: TeamPerformanceRow[]
    isLoading: boolean
}

const MODE_LABEL: Record<string, string> = {
    pipeline: 'Pipeline',
    orchestrator: 'Orchestrator',
    collaboration: 'Collaboration',
}

/**
 * Team performance grid — per-team stats table.
 */
export function TeamPerformanceGrid({ teams, isLoading }: TeamPerformanceGridProps) {
    if (isLoading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
            </div>
        )
    }

    if (teams.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-center">
                <GitBranch className="mb-2 h-8 w-8 text-gray-600" />
                <p className="text-sm text-gray-500">No team activity yet</p>
                <p className="text-xs text-gray-600 mt-1">Run some teams to see performance here.</p>
            </div>
        )
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                <thead>
                    <tr className="border-b border-border text-left">
                        <th className="pb-3 font-medium text-gray-500" style={{ width: '40%' }}>Team</th>
                        <th className="pb-3 font-medium text-gray-500 text-right" style={{ width: '12%' }}>
                            <span className="flex items-center justify-end gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Done
                            </span>
                        </th>
                        <th className="pb-3 font-medium text-gray-500 text-right" style={{ width: '12%' }}>
                            <span className="flex items-center justify-end gap-1">
                                <XCircle className="h-3 w-3" /> Failed
                            </span>
                        </th>
                        <th className="pb-3 font-medium text-gray-500 text-right" style={{ width: '12%' }}>Rate</th>
                        <th className="pb-3 font-medium text-gray-500 text-right" style={{ width: '12%' }}>
                            <span className="flex items-center justify-end gap-1">
                                <Hash className="h-3 w-3" /> Tokens
                            </span>
                        </th>
                        <th className="pb-3 font-medium text-gray-500 text-right" style={{ width: '12%' }}>
                            <span className="flex items-center justify-end gap-1">
                                <Coins className="h-3 w-3" /> Cost
                            </span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {teams.map((team) => {
                        const total = team.completedCount + team.failedCount
                        const rate = total > 0 ? Math.round((team.completedCount / total) * 100) : 0

                        return (
                            <tr key={team.teamId} className="border-b border-border/50 hover:bg-surface-elevated/30 transition-colors">
                                <td className="py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10">
                                            <GitBranch className="h-3.5 w-3.5 text-violet-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <span className="font-medium text-gray-200">{team.teamName}</span>
                                            <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-500">
                                                {MODE_LABEL[team.mode] ?? team.mode}
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 text-right text-green-400 font-medium">{team.completedCount}</td>
                                <td className="py-3 text-right text-red-400">{team.failedCount}</td>
                                <td className="py-3 text-right">
                                    <span className={cn(
                                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                        rate >= 80 ? 'bg-green-500/10 text-green-400' :
                                            rate >= 50 ? 'bg-yellow-500/10 text-yellow-400' :
                                                'bg-red-500/10 text-red-400',
                                    )}>
                                        {rate}%
                                    </span>
                                </td>
                                <td className="py-3 text-right text-gray-400">{team.totalTokens.toLocaleString()}</td>
                                <td className="py-3 text-right text-gray-400">${team.totalCost.toFixed(4)}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
