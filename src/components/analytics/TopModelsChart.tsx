// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import type { ModelUsage } from '@/db/analytics'

interface TopModelsChartProps {
    data: ModelUsage[]
    isLoading: boolean
}

/**
 * Horizontal bar chart — top models by usage count.
 */
export function TopModelsChart({ data, isLoading }: TopModelsChartProps) {
    if (isLoading) {
        return <Skeleton className="h-[280px] w-full rounded-lg" />
    }

    if (data.length === 0) {
        return (
            <div className="flex h-[280px] items-center justify-center text-sm text-gray-500">
                No model usage data for this period
            </div>
        )
    }

    // Shorten model names for display
    const formatted = data.map((d) => ({
        ...d,
        shortName: d.model.replace(/^(gpt-|claude-|gemini-)/, ''),
    }))

    return (
        <ResponsiveContainer width="100%" height={280}>
            <BarChart data={formatted} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" horizontal={false} />
                <XAxis
                    type="number"
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    axisLine={{ stroke: '#2d2d2d' }}
                    tickLine={false}
                    allowDecimals={false}
                />
                <YAxis
                    type="category"
                    dataKey="shortName"
                    tick={{ fill: '#d1d5db', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={120}
                />
                <Tooltip
                    contentStyle={{
                        background: '#1f1f1f',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        fontSize: '12px',
                    }}
                    formatter={(value?: number, _name?: string, props?: { payload?: { model?: string; tokens?: number } }) => {
                        const model = props?.payload?.model ?? ''
                        const tokens = props?.payload?.tokens ?? 0
                        return [`${value ?? 0} runs (${tokens.toLocaleString()} tokens)`, model]
                    }}
                    labelStyle={{ color: '#9ca3af' }}
                />
                <Bar
                    dataKey="count"
                    fill="#8b5cf6"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={28}
                    name="Runs"
                />
            </BarChart>
        </ResponsiveContainer>
    )
}
