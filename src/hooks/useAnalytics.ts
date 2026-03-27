// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'
import {
    fetchCompletionOverTime,
    fetchCostByAgent,
    fetchStatusDistribution,
    fetchTopModels,
    fetchCostOverTime,
    fetchTimeSaved,
    fetchTokenBreakdown,
    fetchModelPerformance,
} from '@/db/analytics'
import type { DailyCompletion, AgentCost, StatusCount, ModelUsage, DailyCost, TimeSavedData, AgentTokenBreakdown, ModelPerformance } from '@/db/analytics'

const STALE_TIME = 60 * 1000 // 60 seconds

/** Task completion over time (area chart data) */
export function useCompletionOverTime(workspaceId: string | null, startDate: string, endDate: string) {
    const { data = [], isLoading, error } = useQuery<DailyCompletion[]>({
        queryKey: ['analytics-completion', workspaceId, startDate, endDate],
        queryFn: () => fetchCompletionOverTime(workspaceId ?? '', startDate, endDate),
        enabled: !!workspaceId,
        staleTime: STALE_TIME,
        refetchOnWindowFocus: true,
    })
    return { data, isLoading, error }
}

/** Cost by agent (bar chart data) */
export function useCostByAgent(workspaceId: string | null, startDate: string, endDate: string) {
    const { data = [], isLoading, error } = useQuery<AgentCost[]>({
        queryKey: ['analytics-cost-agent', workspaceId, startDate, endDate],
        queryFn: () => fetchCostByAgent(workspaceId ?? '', startDate, endDate),
        enabled: !!workspaceId,
        staleTime: STALE_TIME,
        refetchOnWindowFocus: true,
    })
    return { data, isLoading, error }
}

/** Status distribution (donut chart data) */
export function useStatusDistribution(workspaceId: string | null, startDate: string, endDate: string) {
    const { data = [], isLoading, error } = useQuery<StatusCount[]>({
        queryKey: ['analytics-status', workspaceId, startDate, endDate],
        queryFn: () => fetchStatusDistribution(workspaceId ?? '', startDate, endDate),
        enabled: !!workspaceId,
        staleTime: STALE_TIME,
        refetchOnWindowFocus: true,
    })
    return { data, isLoading, error }
}

/** Top models by usage (bar chart data) */
export function useTopModels(workspaceId: string | null, startDate: string, endDate: string) {
    const { data = [], isLoading, error } = useQuery<ModelUsage[]>({
        queryKey: ['analytics-models', workspaceId, startDate, endDate],
        queryFn: () => fetchTopModels(workspaceId ?? '', startDate, endDate),
        enabled: !!workspaceId,
        staleTime: STALE_TIME,
        refetchOnWindowFocus: true,
    })
    return { data, isLoading, error }
}

/** Daily cost over time (area chart data) */
export function useCostOverTime(workspaceId: string | null, startDate: string, endDate: string) {
    const { data = [], isLoading, error } = useQuery<DailyCost[]>({
        queryKey: ['analytics-cost-time', workspaceId, startDate, endDate],
        queryFn: () => fetchCostOverTime(workspaceId ?? '', startDate, endDate),
        enabled: !!workspaceId,
        staleTime: STALE_TIME,
        refetchOnWindowFocus: true,
    })
    return { data, isLoading, error }
}

/** Time saved estimation */
export function useTimeSaved(workspaceId: string | null, startDate: string, endDate: string) {
    const { data, isLoading, error } = useQuery<TimeSavedData>({
        queryKey: ['analytics-time-saved', workspaceId, startDate, endDate],
        queryFn: () => fetchTimeSaved(workspaceId ?? '', startDate, endDate),
        enabled: !!workspaceId,
        staleTime: STALE_TIME,
        refetchOnWindowFocus: true,
    })
    return { data, isLoading, error }
}

/** Token breakdown by agent (prompt vs completion) */
export function useTokenBreakdown(workspaceId: string | null, startDate: string, endDate: string) {
    const { data = [], isLoading, error } = useQuery<AgentTokenBreakdown[]>({
        queryKey: ['analytics-token-breakdown', workspaceId, startDate, endDate],
        queryFn: () => fetchTokenBreakdown(workspaceId ?? '', startDate, endDate),
        enabled: !!workspaceId,
        staleTime: STALE_TIME,
        refetchOnWindowFocus: true,
    })
    return { data, isLoading, error }
}

/** Model performance comparison (speed vs cost vs tokens) */
export function useModelPerformance(workspaceId: string | null, startDate: string, endDate: string) {
    const { data = [], isLoading, error } = useQuery<ModelPerformance[]>({
        queryKey: ['analytics-model-perf', workspaceId, startDate, endDate],
        queryFn: () => fetchModelPerformance(workspaceId ?? '', startDate, endDate),
        enabled: !!workspaceId,
        staleTime: STALE_TIME,
        refetchOnWindowFocus: true,
    })
    return { data, isLoading, error }
}
