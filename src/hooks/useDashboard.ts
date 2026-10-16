// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'
import {
    fetchDashboardStats,
    fetchAgentPerformance,
    fetchTeamPerformance,
    fetchRecentActivity,
} from '@/db/dashboard'
import type { DashboardStats, AgentPerformanceRow, TeamPerformanceRow, ActivityItem } from '@/db/dashboard'

const REFETCH_INTERVAL = 30 * 1000 // 30 seconds

/**
 * Dashboard stats: task counts + estimated cost.
 */
export function useDashboardStats(workspaceId: string | null) {
    const {
        data: stats,
        isLoading,
        error,
    } = useQuery<DashboardStats>({
        queryKey: ['dashboard-stats', workspaceId],
        queryFn: () => fetchDashboardStats(workspaceId ?? ''),
        enabled: !!workspaceId,
        staleTime: 15 * 1000,
        refetchInterval: REFETCH_INTERVAL,
    })

    return { stats, isLoading, error }
}

/**
 * Per-agent performance metrics.
 */
export function useAgentPerformance(workspaceId: string | null) {
    const {
        data: agents = [],
        isLoading,
        error,
    } = useQuery<AgentPerformanceRow[]>({
        queryKey: ['agent-performance', workspaceId],
        queryFn: () => fetchAgentPerformance(workspaceId ?? ''),
        enabled: !!workspaceId,
        staleTime: 30 * 1000,
        refetchInterval: REFETCH_INTERVAL,
    })

    return { agents, isLoading, error }
}

/**
 * Per-team performance metrics.
 */
export function useTeamPerformance(workspaceId: string | null) {
    const {
        data: teams = [],
        isLoading,
        error,
    } = useQuery<TeamPerformanceRow[]>({
        queryKey: ['team-performance', workspaceId],
        queryFn: () => fetchTeamPerformance(workspaceId ?? ''),
        enabled: !!workspaceId,
        staleTime: 30 * 1000,
        refetchInterval: REFETCH_INTERVAL,
    })

    return { teams, isLoading, error }
}

/**
 * Recent activity feed — tasks + team runs merged.
 */
export function useRecentActivity(workspaceId: string | null) {
    const {
        data: activity = [],
        isLoading,
        error,
    } = useQuery<ActivityItem[]>({
        queryKey: ['recent-activity', workspaceId],
        queryFn: () => fetchRecentActivity(workspaceId ?? ''),
        enabled: !!workspaceId,
        staleTime: 15 * 1000,
        refetchInterval: REFETCH_INTERVAL,
    })

    return { activity, isLoading, error }
}
