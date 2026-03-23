// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    checkIsSuperAdmin, fetchAllWorkspaces, fetchPlatformStats,
    overrideWorkspacePlan, toggleBeta,
    fetchBetaUsers, approveBetaUser, revokeBetaUser,
    fetchAllUsers, fetchPlatformAuditLogs,
    suspendWorkspace, unsuspendWorkspace, deleteWorkspace,
    fetchWorkspaceUsageStats, fetchUsageSpikes, fetchKeyRotationAlerts,
} from '@/db/admin'
import type {
    AdminWorkspace, PlatformStats, BetaUser, AdminUser, AuditLogEntry,
    WorkspaceUsageStats, UsageSpikeEntry, KeyRotationAlert,
} from '@/db/admin'

/** Check if current user is a super admin */
export function useSuperAdmin() {
    const { data: isSuperAdmin = false, isLoading } = useQuery<boolean>({
        queryKey: ['super-admin'],
        queryFn: checkIsSuperAdmin,
        staleTime: 10 * 60 * 1000,
    })
    return { isSuperAdmin, isLoading }
}

/** Fetch all workspaces (admin only) */
export function useAllWorkspaces() {
    return useQuery<AdminWorkspace[]>({
        queryKey: ['admin-workspaces'],
        queryFn: fetchAllWorkspaces,
        staleTime: 60 * 1000,
    })
}

/** Fetch platform stats (admin only) */
export function usePlatformStats() {
    return useQuery<PlatformStats>({
        queryKey: ['admin-stats'],
        queryFn: fetchPlatformStats,
        staleTime: 60 * 1000,
    })
}

/** Override a workspace's plan */
export function useOverridePlan() {
    const queryClient = useQueryClient()
    return useMutation<undefined, Error, { workspaceId: string; plan: string }>({
        mutationFn: async ({ workspaceId, plan }) => {
            await overrideWorkspacePlan(workspaceId, plan)
            return undefined
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['admin-workspaces'] })
            void queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
            void queryClient.invalidateQueries({ queryKey: ['workspace'] })
            void queryClient.invalidateQueries({ queryKey: ['subscription'] })
        },
    })
}

/** Toggle beta status for a workspace */
export function useToggleBeta() {
    const queryClient = useQueryClient()
    return useMutation<undefined, Error, { workspaceId: string; isBeta: boolean }>({
        mutationFn: async ({ workspaceId, isBeta }) => {
            await toggleBeta(workspaceId, isBeta)
            return undefined
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['admin-workspaces'] })
        },
    })
}

/** Fetch all beta users (admin only) */
export function useBetaUsers() {
    return useQuery<BetaUser[]>({
        queryKey: ['admin-beta-users'],
        queryFn: fetchBetaUsers,
        staleTime: 30 * 1000,
    })
}

/** Approve or revoke a beta user */
export function useApproveBetaUser() {
    const queryClient = useQueryClient()
    return useMutation<undefined, Error, { userId: string; approve: boolean }>({
        mutationFn: async ({ userId, approve }) => {
            if (approve) {
                await approveBetaUser(userId)
            } else {
                await revokeBetaUser(userId)
            }
            return undefined
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['admin-beta-users'] })
        },
    })
}

/** Fetch all platform users (admin only) */
export function useAllUsers() {
    return useQuery<AdminUser[]>({
        queryKey: ['admin-users'],
        queryFn: fetchAllUsers,
        staleTime: 60 * 1000,
    })
}

/** Fetch platform-wide audit logs (admin only) */
export function usePlatformAuditLog() {
    return useQuery<AuditLogEntry[]>({
        queryKey: ['admin-audit-log'],
        queryFn: fetchPlatformAuditLogs,
        staleTime: 30 * 1000,
    })
}

/** Suspend a workspace */
export function useSuspendWorkspace() {
    const queryClient = useQueryClient()
    return useMutation<undefined, Error, { workspaceId: string; reason: string }>({
        mutationFn: async ({ workspaceId, reason }) => {
            await suspendWorkspace(workspaceId, reason)
            return undefined
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['admin-workspaces'] })
        },
    })
}

/** Unsuspend a workspace */
export function useUnsuspendWorkspace() {
    const queryClient = useQueryClient()
    return useMutation<undefined, Error, { workspaceId: string }>({
        mutationFn: async ({ workspaceId }) => {
            await unsuspendWorkspace(workspaceId)
            return undefined
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['admin-workspaces'] })
        },
    })
}

/** Delete a workspace */
export function useDeleteWorkspace() {
    const queryClient = useQueryClient()
    return useMutation<undefined, Error, { workspaceId: string }>({
        mutationFn: async ({ workspaceId }) => {
            await deleteWorkspace(workspaceId)
            return undefined
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['admin-workspaces'] })
            void queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
        },
    })
}

/** Fetch per-workspace usage stats for abuse dashboard */
export function useWorkspaceUsageStats(days = 7) {
    return useQuery<WorkspaceUsageStats[]>({
        queryKey: ['admin-usage-stats', days],
        queryFn: () => fetchWorkspaceUsageStats(days),
        staleTime: 60 * 1000,
    })
}

/** Fetch usage spikes (current vs previous window) */
export function useUsageSpikes(days = 7) {
    return useQuery<UsageSpikeEntry[]>({
        queryKey: ['admin-usage-spikes', days],
        queryFn: () => fetchUsageSpikes(days),
        staleTime: 60 * 1000,
    })
}

/** Fetch key rotation alerts from audit logs */
export function useKeyRotationAlerts(days = 7) {
    return useQuery<KeyRotationAlert[]>({
        queryKey: ['admin-key-rotation-alerts', days],
        queryFn: () => fetchKeyRotationAlerts(days),
        staleTime: 60 * 1000,
    })
}
