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
import type { AgentCost } from '@/db/analytics'

interface CostByAgentChartProps {
    data: AgentCost[]
    isLoading: boolean
}

/**
 * Horizontal bar chart — cost by agent.
 */
export function CostByAgentChart({ data, isLoading }: CostByAgentChartProps) {
    if (isLoading) {
        return <Skeleton className="h-[280px] w-full rounded-lg" />
    }

    if (data.length === 0) {
        return (
            <div className="flex h-[280px] items-center justify-center text-sm text-gray-500">
                No cost data for this period
            </div>
        )
    }

    const formatted = data.map((d) => ({
        ...d,
        cost: Number(d.cost.toFixed(4)),
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
                    tickFormatter={(v: number) => `$${v.toFixed(3)}`}
                />
                <YAxis
                    type="category"
                    dataKey="agentName"
                    tick={{ fill: '#d1d5db', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={100}
                />
                <Tooltip
                    contentStyle={{
                        background: '#1f1f1f',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        fontSize: '12px',
                    }}
                    formatter={(value: number | undefined) => [`$${(value ?? 0).toFixed(4)}`, 'Cost']}
                    labelStyle={{ color: '#9ca3af' }}
                />
                <Bar
                    dataKey="cost"
                    fill="#f59e0b"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={28}
                    name="Cost"
                />
            </BarChart>
        </ResponsiveContainer>
    )
}
