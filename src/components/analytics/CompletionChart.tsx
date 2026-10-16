// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import type { DailyCompletion } from '@/db/analytics'

interface CompletionChartProps {
    data: DailyCompletion[]
    isLoading: boolean
}

/**
 * Area chart — daily task completion (completed vs failed) over time.
 */
export function CompletionChart({ data, isLoading }: CompletionChartProps) {
    if (isLoading) {
        return <Skeleton className="h-[280px] w-full rounded-lg" />
    }

    if (data.length === 0) {
        return (
            <div className="flex h-[280px] items-center justify-center text-sm text-gray-500">
                No completion data for this period
            </div>
        )
    }

    const formatted = data.map((d) => ({
        ...d,
        date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }))

    return (
        <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={formatted} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                    <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
                <XAxis
                    dataKey="date"
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    axisLine={{ stroke: '#2d2d2d' }}
                    tickLine={false}
                />
                <YAxis
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                />
                <Tooltip
                    contentStyle={{
                        background: '#1f1f1f',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        fontSize: '12px',
                    }}
                    labelStyle={{ color: '#9ca3af' }}
                />
                <Area
                    type="monotone"
                    dataKey="completed"
                    stroke="#22c55e"
                    fill="url(#gradCompleted)"
                    strokeWidth={2}
                    name="Completed"
                />
                <Area
                    type="monotone"
                    dataKey="failed"
                    stroke="#ef4444"
                    fill="url(#gradFailed)"
                    strokeWidth={2}
                    name="Failed"
                />
            </AreaChart>
        </ResponsiveContainer>
    )
}
