// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts'
import type { AgentTokenBreakdown } from '@/db/analytics'

interface Props {
    data: AgentTokenBreakdown[]
    isLoading: boolean
}

const PROMPT_COLOR = '#3b82f6'      // blue-500
const COMPLETION_COLOR = '#22c55e'  // green-500

function formatTokens(val: number): string {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`
    return val.toString()
}

interface TooltipEntry {
    dataKey: string
    value: number
    color: string
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
    if (!active || !payload?.length) return null
    return (
        <div style={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
            <p style={{ color: '#f9fafb', marginBottom: 4 }}>{label}</p>
            {payload.map((entry: TooltipEntry) => (
                <p key={entry.dataKey} style={{ color: entry.color, margin: 0 }}>
                    {entry.dataKey === 'promptTokens' ? 'Prompt' : 'Completion'}: {formatTokens(entry.value)}
                </p>
            ))}
        </div>
    )
}

/**
 * Stacked horizontal bar chart: prompt vs completion tokens per agent.
 */
export function TokenBreakdownChart({ data, isLoading }: Props) {
    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
            </div>
        )
    }

    if (data.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-gray-500">
                No token data available yet. Run some tasks to see the breakdown.
            </div>
        )
    }

    // Show top 8 agents
    const chartData = data.slice(0, 8)

    return (
        <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <XAxis type="number" tickFormatter={formatTokens} stroke="#6b7280" fontSize={12} />
                    <YAxis
                        type="category"
                        dataKey="agentName"
                        width={120}
                        tick={{ fill: '#d1d5db', fontSize: 12 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                        formatter={(value: string) => (value === 'promptTokens' ? 'Prompt Tokens' : 'Completion Tokens')}
                        wrapperStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="promptTokens" stackId="tokens" fill={PROMPT_COLOR} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="completionTokens" stackId="tokens" fill={COMPLETION_COLOR} radius={[0, 4, 4, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
