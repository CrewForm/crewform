// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Model Performance Comparison chart.
 * Displays a comparison table with inline bar visuals for speed, cost, and tokens per model.
 */

import { Loader2, Zap, DollarSign, Hash, Clock } from 'lucide-react'
import type { ModelPerformance } from '@/db/analytics'

interface Props {
    data: ModelPerformance[]
    isLoading: boolean
}

function formatSpeed(ms: number): string {
    if (ms === 0) return '—'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
}

function formatCost(cost: number): string {
    if (cost === 0) return '—'
    if (cost < 0.01) return `$${cost.toFixed(4)}`
    return `$${cost.toFixed(3)}`
}

function formatTokens(tokens: number): string {
    if (tokens === 0) return '—'
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
    return tokens.toString()
}

/** Inline bar that fills proportionally to max */
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
    return (
        <div className="h-1.5 w-full rounded-full bg-white/5">
            <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
            />
        </div>
    )
}

export function ModelPerformanceChart({ data, isLoading }: Props) {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center rounded-xl border border-border bg-surface-card p-8">
                <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
            </div>
        )
    }

    if (data.length === 0) {
        return (
            <div className="rounded-xl border border-border bg-surface-card p-6 text-center">
                <Zap className="mx-auto mb-2 h-8 w-8 text-gray-600" />
                <p className="text-sm text-gray-500">No model performance data for this period</p>
            </div>
        )
    }

    const maxSpeed = Math.max(...data.map((d) => d.avgSpeedMs))
    const maxCost = Math.max(...data.map((d) => d.avgCostPerRun))
    const maxTokens = Math.max(...data.map((d) => d.avgTokensPerRun))

    return (
        <div className="rounded-xl border border-border bg-surface-card p-5">
            <div className="mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4 text-brand-primary" />
                <h3 className="text-sm font-semibold text-gray-200">Model Performance Comparison</h3>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-border/50 text-gray-500">
                            <th className="pb-2 text-left font-medium">Model</th>
                            <th className="pb-2 text-right font-medium">
                                <span className="inline-flex items-center gap-1"><Hash className="h-3 w-3" /> Runs</span>
                            </th>
                            <th className="pb-2 text-right font-medium" style={{ minWidth: 120 }}>
                                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Avg Speed</span>
                            </th>
                            <th className="pb-2 text-right font-medium" style={{ minWidth: 120 }}>
                                <span className="inline-flex items-center gap-1"><DollarSign className="h-3 w-3" /> Cost/Run</span>
                            </th>
                            <th className="pb-2 text-right font-medium" style={{ minWidth: 120 }}>
                                <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3" /> Tokens/Run</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row) => (
                            <tr key={row.model} className="border-b border-border/20 last:border-0">
                                <td className="py-2.5 pr-3">
                                    <span className="font-medium text-gray-200">{row.model}</span>
                                </td>
                                <td className="py-2.5 text-right text-gray-400">{row.runCount}</td>
                                <td className="py-2.5 pl-4">
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="text-gray-300">{formatSpeed(row.avgSpeedMs)}</span>
                                        <MiniBar value={row.avgSpeedMs} max={maxSpeed} color="#3b82f6" />
                                    </div>
                                </td>
                                <td className="py-2.5 pl-4">
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="text-gray-300">{formatCost(row.avgCostPerRun)}</span>
                                        <MiniBar value={row.avgCostPerRun} max={maxCost} color="#f59e0b" />
                                    </div>
                                </td>
                                <td className="py-2.5 pl-4">
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="text-gray-300">{formatTokens(row.avgTokensPerRun)}</span>
                                        <MiniBar value={row.avgTokensPerRun} max={maxTokens} color="#6bedb9" />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
