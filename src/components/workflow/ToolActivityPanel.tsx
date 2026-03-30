// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Tool/MCP activity heatmap panel for the workflow canvas.
 *
 * Aggregates tool call data from team messages during execution
 * and shows usage statistics: call count, success rate, avg duration.
 */

import { useMemo } from 'react'
import { Wrench, CheckCircle2, XCircle, Timer, X, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TeamMessage } from '@/types'

interface ToolActivityPanelProps {
    messages: TeamMessage[]
    onClose: () => void
}

interface ToolStat {
    name: string
    calls: number
    successes: number
    failures: number
    totalDuration: number
}

export function ToolActivityPanel({ messages, onClose }: ToolActivityPanelProps) {
    const toolStats = useMemo(() => {
        const stats = new Map<string, ToolStat>()

        for (const msg of messages) {
            const metadata = msg.metadata as Record<string, unknown> | null
            if (!metadata) continue

            const toolCalls = Array.isArray(metadata.tool_calls)
                ? (metadata.tool_calls as { tool: string; success: boolean; duration_ms: number }[])
                : []

            for (const tc of toolCalls) {
                const existing = stats.get(tc.tool)
                if (existing) {
                    existing.calls++
                    if (tc.success) existing.successes++
                    else existing.failures++
                    existing.totalDuration += tc.duration_ms
                } else {
                    stats.set(tc.tool, {
                        name: tc.tool,
                        calls: 1,
                        successes: tc.success ? 1 : 0,
                        failures: tc.success ? 0 : 1,
                        totalDuration: tc.duration_ms,
                    })
                }
            }
        }

        // Sort by most used
        return Array.from(stats.values()).sort((a, b) => b.calls - a.calls)
    }, [messages])

    const totalCalls = toolStats.reduce((sum, t) => sum + t.calls, 0)
    const totalSuccess = toolStats.reduce((sum, t) => sum + t.successes, 0)
    const overallRate = totalCalls > 0 ? Math.round((totalSuccess / totalCalls) * 100) : 0

    return (
        <div className="workflow-glass-popup rounded-xl w-72 flex flex-col max-h-[420px] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-brand-primary" />
                    <span className="text-xs font-semibold text-gray-300">Tool Activity</span>
                    <span className="text-[10px] text-gray-500">
                        {totalCalls} calls
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded p-1 text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>

            {/* Summary bar */}
            {totalCalls > 0 && (
                <div className="px-3 py-2 border-b border-white/5 flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all"
                            style={{
                                width: `${overallRate}%`,
                                background: overallRate >= 90
                                    ? 'rgb(74, 222, 128)'
                                    : overallRate >= 70
                                        ? 'rgb(251, 191, 36)'
                                        : 'rgb(248, 113, 113)',
                            }}
                        />
                    </div>
                    <span className={cn(
                        'text-[10px] font-medium',
                        overallRate >= 90 ? 'text-green-400' :
                        overallRate >= 70 ? 'text-amber-400' :
                        'text-red-400',
                    )}>
                        {overallRate}% success
                    </span>
                </div>
            )}

            {/* Tool list */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
                {toolStats.length === 0 ? (
                    <p className="text-center text-[11px] text-gray-600 py-4">
                        No tool calls recorded yet.
                    </p>
                ) : (
                    toolStats.map((tool) => {
                        const rate = Math.round((tool.successes / tool.calls) * 100)
                        const avgMs = Math.round(tool.totalDuration / tool.calls)

                        return (
                            <div
                                key={tool.name}
                                className="flex items-center gap-2 rounded-lg bg-white/[0.02] border border-white/5 p-2"
                            >
                                <Wrench className="h-3 w-3 text-gray-600 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-mono text-gray-300 truncate">
                                            {tool.name}
                                        </span>
                                        <span className="text-[9px] text-gray-500 ml-2 shrink-0">
                                            ×{tool.calls}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="flex items-center gap-0.5 text-[9px]">
                                            <CheckCircle2 className="h-2.5 w-2.5 text-green-400" />
                                            <span className="text-green-400">{tool.successes}</span>
                                        </span>
                                        {tool.failures > 0 && (
                                            <span className="flex items-center gap-0.5 text-[9px]">
                                                <XCircle className="h-2.5 w-2.5 text-red-400" />
                                                <span className="text-red-400">{tool.failures}</span>
                                            </span>
                                        )}
                                        <span className="flex items-center gap-0.5 text-[9px] text-gray-600">
                                            <Timer className="h-2.5 w-2.5" />
                                            {avgMs}ms
                                        </span>
                                        {/* Success rate bar */}
                                        <div className="ml-auto w-8 h-1 rounded-full bg-gray-800 overflow-hidden">
                                            <div
                                                className="h-full rounded-full"
                                                style={{
                                                    width: `${rate}%`,
                                                    background: rate >= 90
                                                        ? 'rgb(74, 222, 128)'
                                                        : rate >= 70
                                                            ? 'rgb(251, 191, 36)'
                                                            : 'rgb(248, 113, 113)',
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
