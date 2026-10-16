// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { Loader2 } from 'lucide-react'
import type { DailyCost } from '@/db/analytics'

interface CostOverTimeChartProps {
    data: DailyCost[]
    isLoading: boolean
}

/**
 * Area chart showing daily cost + cumulative cost over time.
 */
export function CostOverTimeChart({ data, isLoading }: CostOverTimeChartProps) {
    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    if (data.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-gray-500">
                No cost data in this range
            </div>
        )
    }

    return (
        <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="cumulGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: '#6b7280' }}
                        tickFormatter={(d: string) => d.slice(5)} // MM-DD
                        minTickGap={30}
                    />
                    <YAxis
                        yAxisId="daily"
                        tick={{ fontSize: 10, fill: '#6b7280' }}
                        tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                        width={55}
                    />
                    <YAxis
                        yAxisId="cumul"
                        orientation="right"
                        tick={{ fontSize: 10, fill: '#6b7280' }}
                        tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                        width={55}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#18181b',
                            border: '1px solid #27272a',
                            borderRadius: 8,
                            fontSize: 12,
                        }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any, name?: string) => [
                            `$${Number(value).toFixed(4)}`,
                            name === 'cost' ? 'Daily Cost' : 'Cumulative',
                        ]}
                        labelFormatter={(label) => String(label)}
                    />
                    <Area
                        yAxisId="daily"
                        type="monotone"
                        dataKey="cost"
                        stroke="#f59e0b"
                        fill="url(#costGrad)"
                        strokeWidth={2}
                    />
                    <Area
                        yAxisId="cumul"
                        type="monotone"
                        dataKey="cumulative"
                        stroke="#8b5cf6"
                        fill="url(#cumulGrad)"
                        strokeWidth={2}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    )
}
