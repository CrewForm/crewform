// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import {
    useCompletionOverTime,
    useCostByAgent,
    useStatusDistribution,
    useTopModels,
    useCostOverTime,
    useTimeSaved,
    useTokenBreakdown,
    useModelPerformance,
} from '@/hooks/useAnalytics'
import { DateRangePicker, DATE_PRESETS } from '@/components/analytics/DateRangePicker'
import type { DateRange } from '@/components/analytics/DateRangePicker'
import { CompletionChart } from '@/components/analytics/CompletionChart'
import { CostByAgentChart } from '@/components/analytics/CostByAgentChart'
import { StatusDonutChart } from '@/components/analytics/StatusDonutChart'
import { TopModelsChart } from '@/components/analytics/TopModelsChart'
import { CostOverTimeChart } from '@/components/analytics/CostOverTimeChart'
import { UsageSummaryCards } from '@/components/analytics/UsageSummaryCards'
import { TimeSavedCard } from '@/components/analytics/TimeSavedCard'
import { CsvExportButton } from '@/components/analytics/CsvExportButton'
import { TokenBreakdownChart } from '@/components/analytics/TokenBreakdownChart'
import { CostForecastCard } from '@/components/analytics/CostForecastCard'
import { ModelPerformanceChart } from '@/components/analytics/ModelPerformanceChart'
import { useUsageSummary } from '@/hooks/useUsage'
import { ErrorState } from '@/components/shared/ErrorState'

/**
 * Analytics page — charts, summary cards, time saved, and CSV export.
 */
export function Analytics() {
    const { workspaceId } = useWorkspace()
    const [range, setRange] = useState<DateRange>(DATE_PRESETS[1]) // Default: Last 30 days

    const { data: completionData, isLoading: isLoadingCompletion, error: completionError } = useCompletionOverTime(
        workspaceId, range.startDate, range.endDate,
    )
    const { data: costData, isLoading: isLoadingCost } = useCostByAgent(
        workspaceId, range.startDate, range.endDate,
    )
    const { data: statusData, isLoading: isLoadingStatus } = useStatusDistribution(
        workspaceId, range.startDate, range.endDate,
    )
    const { data: modelData, isLoading: isLoadingModels } = useTopModels(
        workspaceId, range.startDate, range.endDate,
    )
    const { data: costTimeData, isLoading: isLoadingCostTime } = useCostOverTime(
        workspaceId, range.startDate, range.endDate,
    )
    const { data: timeSavedData, isLoading: isLoadingTimeSaved } = useTimeSaved(
        workspaceId, range.startDate, range.endDate,
    )
    const { summary, isLoading: isLoadingUsage } = useUsageSummary(
        workspaceId, range.startDate, range.endDate,
    )
    const { data: tokenData, isLoading: isLoadingTokens } = useTokenBreakdown(
        workspaceId, range.startDate, range.endDate,
    )
    const { data: modelPerfData, isLoading: isLoadingModelPerf } = useModelPerformance(
        workspaceId, range.startDate, range.endDate,
    )

    const anyError = completionError

    return (
        <div className="p-6 lg:p-8">
            {/* Header */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <BarChart3 className="h-6 w-6 text-brand-primary" />
                    <h1 className="text-2xl font-semibold text-gray-100">Analytics</h1>
                </div>
                <div className="flex items-center gap-2">
                    <CsvExportButton
                        workspaceId={workspaceId}
                        startDate={range.startDate}
                        endDate={range.endDate}
                    />
                    <DateRangePicker activeLabel={range.label} onChange={setRange} />
                </div>
            </div>

            {/* Error state */}
            {anyError && (
                <div className="mb-6">
                    <ErrorState
                        message={anyError instanceof Error ? anyError.message : 'Failed to load analytics data'}
                    />
                </div>
            )}

            {/* Usage Summary Cards */}
            <div className="mb-6">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                    Usage Summary
                </h2>
                <UsageSummaryCards summary={summary} isLoading={isLoadingUsage} />
            </div>

            {/* Time Saved + Cost Forecast — side by side */}
            <div className="mb-6 grid gap-6 lg:grid-cols-2">
                <TimeSavedCard data={timeSavedData} isLoading={isLoadingTimeSaved} />
                <CostForecastCard historicalData={costTimeData} isLoading={isLoadingCostTime} />
            </div>

            {/* Cost Over Time — full width */}
            <div className="mb-6 rounded-xl border border-border bg-surface-card p-5">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                    Cost Over Time
                </h2>
                <CostOverTimeChart data={costTimeData} isLoading={isLoadingCostTime} />
            </div>

            {/* Model Performance — full width */}
            <div className="mb-6">
                <ModelPerformanceChart data={modelPerfData} isLoading={isLoadingModelPerf} />
            </div>

            {/* Charts grid — 2×2 */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Completion Over Time */}
                <div className="rounded-xl border border-border bg-surface-card p-5">
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Task Completion Over Time
                    </h2>
                    <CompletionChart data={completionData} isLoading={isLoadingCompletion} />
                </div>

                {/* Status Distribution */}
                <div className="rounded-xl border border-border bg-surface-card p-5">
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Status Distribution
                    </h2>
                    <StatusDonutChart data={statusData} isLoading={isLoadingStatus} />
                </div>

                {/* Cost By Agent */}
                <div className="rounded-xl border border-border bg-surface-card p-5">
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Cost By Agent
                    </h2>
                    <CostByAgentChart data={costData} isLoading={isLoadingCost} />
                </div>

                {/* Top Models */}
                <div className="rounded-xl border border-border bg-surface-card p-5">
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Top Models By Usage
                    </h2>
                    <TopModelsChart data={modelData} isLoading={isLoadingModels} />
                </div>

                {/* Token Breakdown */}
                <div className="rounded-xl border border-border bg-surface-card p-5">
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Token Breakdown (Prompt vs Completion)
                    </h2>
                    <TokenBreakdownChart data={tokenData} isLoading={isLoadingTokens} />
                </div>
            </div>
        </div>
    )
}

