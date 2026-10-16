// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import type { StatusCount } from '@/db/analytics'

interface StatusDonutChartProps {
    data: StatusCount[]
    isLoading: boolean
}

/**
 * Donut chart — task status distribution.
 */
export function StatusDonutChart({ data, isLoading }: StatusDonutChartProps) {
    if (isLoading) {
        return <Skeleton className="h-[280px] w-full rounded-lg" />
    }

    if (data.length === 0) {
        return (
            <div className="flex h-[280px] items-center justify-center text-sm text-gray-500">
                No tasks in this period
            </div>
        )
    }

    const total = data.reduce((sum, d) => sum + d.count, 0)

    return (
        <ResponsiveContainer width="100%" height={280}>
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="status"
                    strokeWidth={0}
                >
                    {data.map((entry) => (
                        // eslint-disable-next-line @typescript-eslint/no-deprecated -- Cell is the standard Recharts API for per-slice colors
                        <Cell key={entry.status} fill={entry.color} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={{
                        background: '#1f1f1f',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        fontSize: '12px',
                    }}
                    formatter={(value?: number, name?: string) => {
                        const v = value ?? 0
                        return [
                            `${v} (${total > 0 ? Math.round((v / total) * 100) : 0}%)`,
                            name ?? '',
                        ]
                    }}
                />
                <Legend
                    wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }}
                    iconType="circle"
                    iconSize={8}
                />
            </PieChart>
        </ResponsiveContainer>
    )
}
