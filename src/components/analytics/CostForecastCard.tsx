// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus, DollarSign } from 'lucide-react'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from 'recharts'
import { computeCostForecast } from '@/db/analytics'
import type { DailyCost } from '@/db/analytics'

interface Props {
    historicalData: DailyCost[]
    isLoading: boolean
}

interface ChartDatum {
    date: string
    actual: number | null
    forecast: number | null
}

const HISTORICAL_COLOR = '#6bedb9'
const FORECAST_COLOR = '#f59e0b'

interface CostTooltipEntry {
    dataKey: string
    value: number | null
    color: string
}

function CostTooltip({ active, payload, label }: { active?: boolean; payload?: CostTooltipEntry[]; label?: string }) {
    if (!active || !payload?.length) return null
    return (
        <div style={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
            <p style={{ color: '#9ca3af', margin: 0, marginBottom: 4 }}>{label}</p>
            {payload.map((entry: CostTooltipEntry) => (
                <p key={entry.dataKey} style={{ color: entry.color, margin: 0 }}>
                    {entry.dataKey === 'actual' ? 'Actual' : 'Forecast'}: {typeof entry.value === 'number' ? `$${entry.value.toFixed(4)}` : '–'}
                </p>
            ))}
        </div>
    )
}

/**
 * Cost forecast card: 30-day projection + trend indicator + mini area chart.
 */
export function CostForecastCard({ historicalData, isLoading }: Props) {
    const forecast = useMemo(() => computeCostForecast(historicalData), [historicalData])

    if (isLoading) {
        return (
            <div className="rounded-xl border border-border bg-surface-card p-5">
                <div className="flex h-48 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                </div>
            </div>
        )
    }

    // Build combined chart data: historical (last 14 days) + forecast
    const historicalSlice = historicalData.slice(-14)
    const chartData: ChartDatum[] = [
        ...historicalSlice.map(d => ({
            date: d.date.slice(5), // 'MM-DD'
            actual: d.cost,
            forecast: null as number | null,
        })),
        ...forecast.forecastDays.slice(0, 14).map(d => ({
            date: d.date.slice(5),
            actual: null as number | null,
            forecast: d.projectedCost,
        })),
    ]

    // Bridge: last historical point should also appear as first forecast point
    if (historicalSlice.length > 0 && forecast.forecastDays.length > 0) {
        const lastHistorical = historicalSlice[historicalSlice.length - 1]
        chartData[historicalSlice.length - 1].forecast = lastHistorical.cost
    }

    const TrendIcon = forecast.trend === 'up' ? TrendingUp : forecast.trend === 'down' ? TrendingDown : Minus
    const trendColor = forecast.trend === 'up' ? 'text-red-400' : forecast.trend === 'down' ? 'text-green-400' : 'text-gray-400'

    return (
        <div className="rounded-xl border border-border bg-surface-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                Cost Forecast (30 days)
            </h2>

            {/* Stats row */}
            <div className="mb-4 grid grid-cols-3 gap-4">
                <div>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                        <DollarSign className="h-3 w-3" />
                        Projected
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-100">
                        ${forecast.monthlyEstimate.toFixed(2)}
                    </div>
                </div>
                <div>
                    <div className="text-xs text-gray-500">Daily Avg</div>
                    <div className="mt-1 text-lg font-semibold text-gray-200">
                        ${forecast.avgDailyCost.toFixed(4)}
                    </div>
                </div>
                <div>
                    <div className="text-xs text-gray-500">Trend</div>
                    <div className={`mt-1 flex items-center gap-1 text-lg font-semibold ${trendColor}`}>
                        <TrendIcon className="h-4 w-4" />
                        {Math.abs(forecast.trendPercent).toFixed(1)}%
                    </div>
                </div>
            </div>

            {/* Mini chart */}
            {chartData.length > 0 && (
                <div className="h-28">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                            <defs>
                                <linearGradient id="historicalGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={HISTORICAL_COLOR} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={HISTORICAL_COLOR} stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={FORECAST_COLOR} stopOpacity={0.2} />
                                    <stop offset="95%" stopColor={FORECAST_COLOR} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={false} axisLine={false} />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip content={<CostTooltip />} />
                            <ReferenceLine
                                x={historicalSlice.length > 0 ? historicalSlice[historicalSlice.length - 1].date.slice(5) : undefined}
                                stroke="#4b5563"
                                strokeDasharray="3 3"
                            />
                            <Area
                                type="monotone"
                                dataKey="actual"
                                stroke={HISTORICAL_COLOR}
                                fill="url(#historicalGrad)"
                                strokeWidth={2}
                                connectNulls={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="forecast"
                                stroke={FORECAST_COLOR}
                                fill="url(#forecastGrad)"
                                strokeWidth={2}
                                strokeDasharray="5 3"
                                connectNulls={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {forecast.forecastDays.length === 0 && (
                <div className="flex h-28 items-center justify-center text-sm text-gray-500">
                    Not enough data to generate a forecast. Need at least 2 days of activity.
                </div>
            )}
        </div>
    )
}
