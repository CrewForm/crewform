// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'
import { fetchUsageSummary, fetchUsageTimeline } from '@/db/usage'
import type { UsageSummary, UsageDayEntry } from '@/db/usage'

const STALE_TIME = 60 * 1000

/** Aggregate usage summary for the date range */
export function useUsageSummary(workspaceId: string | null, startDate: string, endDate: string) {
    const { data: summary, isLoading, error } = useQuery<UsageSummary>({
        queryKey: ['usage-summary', workspaceId, startDate, endDate],
        queryFn: () => fetchUsageSummary(workspaceId ?? '', startDate, endDate),
        enabled: !!workspaceId,
        staleTime: STALE_TIME,
        refetchOnWindowFocus: true,
    })
    return { summary, isLoading, error }
}

/** Daily usage timeline for the date range */
export function useUsageTimeline(workspaceId: string | null, startDate: string, endDate: string) {
    const { data = [], isLoading, error } = useQuery<UsageDayEntry[]>({
        queryKey: ['usage-timeline', workspaceId, startDate, endDate],
        queryFn: () => fetchUsageTimeline(workspaceId ?? '', startDate, endDate),
        enabled: !!workspaceId,
        staleTime: STALE_TIME,
        refetchOnWindowFocus: true,
    })
    return { data, isLoading, error }
}
