// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { Bot, CheckCircle2, XCircle, Coins, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { AgentPerformanceRow } from '@/db/dashboard'

interface AgentPerformanceGridProps {
    agents: AgentPerformanceRow[]
    isLoading: boolean
}

/**
 * Agent performance grid — per-agent stats table.
 */
export function AgentPerformanceGrid({ agents, isLoading }: AgentPerformanceGridProps) {
    if (isLoading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
            </div>
        )
    }

    if (agents.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-center">
                <Bot className="mb-2 h-8 w-8 text-gray-600" />
                <p className="text-sm text-gray-500">No agent activity yet</p>
                <p className="text-xs text-gray-600 mt-1">Run some tasks to see agent performance here.</p>
            </div>
        )
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                <thead>
                    <tr className="border-b border-border text-left">
                        <th className="pb-3 font-medium text-gray-500" style={{ width: '40%' }}>Agent</th>
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
                    {agents.map((agent) => {
                        const total = agent.completedCount + agent.failedCount
                        const rate = total > 0 ? Math.round((agent.completedCount / total) * 100) : 0

                        return (
                            <tr key={agent.agentId} className="border-b border-border/50 hover:bg-surface-elevated/30 transition-colors">
                                <td className="py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-muted">
                                            <Bot className="h-3.5 w-3.5 text-brand-primary" />
                                        </div>
                                        <span className="font-medium text-gray-200">{agent.agentName}</span>
                                    </div>
                                </td>
                                <td className="py-3 text-right text-green-400 font-medium">{agent.completedCount}</td>
                                <td className="py-3 text-right text-red-400">{agent.failedCount}</td>
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
                                <td className="py-3 text-right text-gray-400">{agent.totalTokens.toLocaleString()}</td>
                                <td className="py-3 text-right text-gray-400">${agent.totalCost.toFixed(4)}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
