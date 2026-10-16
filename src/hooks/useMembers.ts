// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    fetchMembers, updateMemberRole, removeMember,
    fetchInvitations, createInvitation, revokeInvitation,
    fetchAuditLog, updateWorkspace,
    fetchAuditStreamingConfig, updateAuditStreamingConfig,
} from '@/db/members'
import type {
    WorkspaceMemberRow, WorkspaceInvitation, AuditLogEntry,
    AuditLogFilters, AuditStreamingConfig,
} from '@/db/members'
import type { WorkspaceRole } from '@/types'

// ─── Members ────────────────────────────────────────────────────────────────

export function useMembers(workspaceId: string | null) {
    return useQuery<WorkspaceMemberRow[]>({
        queryKey: ['members', workspaceId],
        queryFn: () => {
            if (!workspaceId) throw new Error('Missing workspaceId')
            return fetchMembers(workspaceId)
        },
        enabled: !!workspaceId,
    })
}

export function useUpdateMemberRole() {
    const queryClient = useQueryClient()
    return useMutation<undefined, Error, { memberId: string; role: WorkspaceRole; workspaceId: string }>({
        mutationFn: async ({ memberId, role }) => {
            await updateMemberRole(memberId, role)
            return undefined
        },
        onSuccess: (_d, { workspaceId }) => {
            void queryClient.invalidateQueries({ queryKey: ['members', workspaceId] })
        },
    })
}

export function useRemoveMember() {
    const queryClient = useQueryClient()
    return useMutation<undefined, Error, { memberId: string; workspaceId: string }>({
        mutationFn: async ({ memberId }) => {
            await removeMember(memberId)
            return undefined
        },
        onSuccess: (_d, { workspaceId }) => {
            void queryClient.invalidateQueries({ queryKey: ['members', workspaceId] })
        },
    })
}

// ─── Invitations ────────────────────────────────────────────────────────────

export function useInvitations(workspaceId: string | null) {
    return useQuery<WorkspaceInvitation[]>({
        queryKey: ['invitations', workspaceId],
        queryFn: () => {
            if (!workspaceId) throw new Error('Missing workspaceId')
            return fetchInvitations(workspaceId)
        },
        enabled: !!workspaceId,
    })
}

export function useCreateInvitation() {
    const queryClient = useQueryClient()
    return useMutation<WorkspaceInvitation, Error, {
        workspaceId: string; email: string; role: WorkspaceRole; invitedBy: string
    }>({
        mutationFn: ({ workspaceId, email, role, invitedBy }) =>
            createInvitation(workspaceId, email, role, invitedBy),
        onSuccess: (inv) => {
            void queryClient.invalidateQueries({ queryKey: ['invitations', inv.workspace_id] })
            void queryClient.invalidateQueries({ queryKey: ['audit-log', inv.workspace_id] })
        },
    })
}

export function useRevokeInvitation() {
    const queryClient = useQueryClient()
    return useMutation<undefined, Error, { id: string; workspaceId: string }>({
        mutationFn: async ({ id }) => {
            await revokeInvitation(id)
            return undefined
        },
        onSuccess: (_d, { workspaceId }) => {
            void queryClient.invalidateQueries({ queryKey: ['invitations', workspaceId] })
        },
    })
}

// ─── Audit Log ──────────────────────────────────────────────────────────────

export function useAuditLog(workspaceId: string | null, filters?: AuditLogFilters) {
    return useQuery<AuditLogEntry[]>({
        queryKey: ['audit-log', workspaceId, filters],
        queryFn: () => {
            if (!workspaceId) throw new Error('Missing workspaceId')
            return fetchAuditLog(workspaceId, filters)
        },
        enabled: !!workspaceId,
    })
}

// ─── Audit Streaming ────────────────────────────────────────────────────────

export function useAuditStreamingConfig(workspaceId: string | null) {
    return useQuery<AuditStreamingConfig>({
        queryKey: ['audit-streaming', workspaceId],
        queryFn: () => {
            if (!workspaceId) throw new Error('Missing workspaceId')
            return fetchAuditStreamingConfig(workspaceId)
        },
        enabled: !!workspaceId,
    })
}

export function useUpdateAuditStreamingConfig() {
    const queryClient = useQueryClient()
    return useMutation<undefined, Error, { workspaceId: string; config: AuditStreamingConfig }>({
        mutationFn: async ({ workspaceId, config }) => {
            await updateAuditStreamingConfig(workspaceId, config)
            return undefined
        },
        onSuccess: (_d, { workspaceId }) => {
            void queryClient.invalidateQueries({ queryKey: ['audit-streaming', workspaceId] })
        },
    })
}

// ─── Workspace Settings ─────────────────────────────────────────────────────

export function useUpdateWorkspace() {
    const queryClient = useQueryClient()
    return useMutation<undefined, Error, { workspaceId: string; data: { name?: string; slug?: string } }>({
        mutationFn: async ({ workspaceId, data }) => {
            await updateWorkspace(workspaceId, data)
            return undefined
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['workspace'] })
        },
    })
}
