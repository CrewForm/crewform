// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import { enforceQuota } from '@/lib/enforceQuota'
import type { WorkspaceRole } from '@/types'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WorkspaceMemberRow {
    id: string
    workspace_id: string
    user_id: string
    role: WorkspaceRole
    joined_at: string
    // Joined from user_profiles
    display_name: string | null
    avatar_url: string | null
    email: string | null
}

export interface WorkspaceInvitation {
    id: string
    workspace_id: string
    email: string
    role: WorkspaceRole
    token: string
    invited_by: string
    status: 'pending' | 'accepted' | 'expired'
    expires_at: string
    created_at: string
}

export interface AuditLogEntry {
    id: string
    workspace_id: string
    user_id: string | null
    action: string
    details: Record<string, unknown>
    created_at: string
}

// ─── Members ────────────────────────────────────────────────────────────────

/** Fetch all members of a workspace with profile info */
export async function fetchMembers(workspaceId: string): Promise<WorkspaceMemberRow[]> {
    // workspace_members doesn't have email/display_name, so we query
    // workspace_members and then user_profiles separately
    const membersResult = await supabase
        .from('workspace_members')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('joined_at', { ascending: true })

    if (membersResult.error) throw membersResult.error

    const members = membersResult.data as Array<{
        id: string; workspace_id: string; user_id: string;
        role: WorkspaceRole; joined_at: string
    }>

    // Fetch profiles
    const userIds = members.map(m => m.user_id)
    const profilesResult = await supabase
        .from('user_profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds)

    const profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>()
    if (!profilesResult.error) {
        for (const p of profilesResult.data as Array<{ id: string; display_name: string | null; avatar_url: string | null }>) {
            profileMap.set(p.id, p)
        }
    }

    return members.map(m => ({
        ...m,
        display_name: profileMap.get(m.user_id)?.display_name ?? null,
        avatar_url: profileMap.get(m.user_id)?.avatar_url ?? null,
        email: null, // Email not accessible from client — shown via display_name
    }))
}

/** Update a member's role */
export async function updateMemberRole(memberId: string, role: WorkspaceRole): Promise<void> {
    const result = await supabase
        .from('workspace_members')
        .update({ role })
        .eq('id', memberId)

    if (result.error) throw result.error
}

/** Remove a member from the workspace */
export async function removeMember(memberId: string): Promise<void> {
    const result = await supabase
        .from('workspace_members')
        .delete()
        .eq('id', memberId)

    if (result.error) throw result.error
}

// ─── Invitations ────────────────────────────────────────────────────────────

/** Fetch pending invitations */
export async function fetchInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const result = await supabase
        .from('workspace_invitations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

    if (result.error) throw result.error
    return result.data as WorkspaceInvitation[]
}

/** Create a new invitation */
export async function createInvitation(
    workspaceId: string,
    email: string,
    role: WorkspaceRole,
    invitedBy: string,
): Promise<WorkspaceInvitation> {
    await enforceQuota(workspaceId, 'members')

    const result = await supabase
        .from('workspace_invitations')
        .insert({
            workspace_id: workspaceId,
            email,
            role,
            invited_by: invitedBy,
        })
        .select()
        .single()

    if (result.error) throw result.error

    // Log the invitation
    await supabase.from('audit_log').insert({
        workspace_id: workspaceId,
        user_id: invitedBy,
        action: 'member_invited',
        details: { email, role },
    })

    return result.data as WorkspaceInvitation
}

/** Revoke a pending invitation */
export async function revokeInvitation(id: string): Promise<void> {
    const result = await supabase
        .from('workspace_invitations')
        .delete()
        .eq('id', id)

    if (result.error) throw result.error
}

/** Accept an invitation by token (calls the RPC) */
export async function acceptInvitation(token: string): Promise<{ success: boolean; workspace_id?: string; error?: string }> {
    const result = await supabase.rpc('accept_invitation', { invite_token: token })

    if (result.error) throw result.error
    return result.data as { success: boolean; workspace_id?: string; error?: string }
}

// ─── Audit Log ──────────────────────────────────────────────────────────────

export interface AuditLogFilters {
    action?: string
    dateRange?: 'all' | '7d' | '30d' | '90d'
    offset?: number
    limit?: number
}

/** Fetch audit log entries with optional filters and pagination */
export async function fetchAuditLog(
    workspaceId: string,
    filters: AuditLogFilters = {},
): Promise<AuditLogEntry[]> {
    const { action, dateRange = 'all', offset = 0, limit = 50 } = filters

    let query = supabase
        .from('audit_log')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

    if (action) {
        query = query.eq('action', action)
    }

    if (dateRange !== 'all') {
        const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
        const since = new Date()
        since.setDate(since.getDate() - days)
        query = query.gte('created_at', since.toISOString())
    }

    const result = await query
    if (result.error) throw result.error
    return result.data as AuditLogEntry[]
}

/** Write an audit log entry and fire streaming webhook if configured */
export async function writeAuditLog(
    workspaceId: string,
    userId: string,
    action: string,
    details: Record<string, unknown> = {},
): Promise<void> {
    const entry = { workspace_id: workspaceId, user_id: userId, action, details }
    const result = await supabase
        .from('audit_log')
        .insert(entry)

    if (result.error) throw result.error

    // Fire streaming webhook (fire-and-forget)
    void dispatchAuditWebhook(workspaceId, { ...entry, created_at: new Date().toISOString() })
}

// ─── Audit Streaming ────────────────────────────────────────────────────────

export interface AuditStreamingConfig {
    enabled: boolean
    webhookUrl: string
    service: 'datadog' | 'splunk' | 'custom'
}

const DEFAULT_STREAMING_CONFIG: AuditStreamingConfig = {
    enabled: false,
    webhookUrl: '',
    service: 'custom',
}

/** Fetch audit streaming config from workspace settings */
export async function fetchAuditStreamingConfig(
    workspaceId: string,
): Promise<AuditStreamingConfig> {
    const result = await supabase
        .from('workspaces')
        .select('settings')
        .eq('id', workspaceId)
        .single()

    if (result.error) return DEFAULT_STREAMING_CONFIG
    const settings = (result.data as Record<string, unknown>).settings as Record<string, unknown> | undefined
    if (!settings?.audit_streaming) return DEFAULT_STREAMING_CONFIG
    return settings.audit_streaming as AuditStreamingConfig
}

/** Update audit streaming config in workspace settings */
export async function updateAuditStreamingConfig(
    workspaceId: string,
    config: AuditStreamingConfig,
): Promise<void> {
    // Read current settings first to merge
    const current = await supabase
        .from('workspaces')
        .select('settings')
        .eq('id', workspaceId)
        .single()

    const row = current.data as Record<string, unknown>
    const existing: Record<string, unknown> = (row.settings as Record<string, unknown> | null) ?? {}

    const result = await supabase
        .from('workspaces')
        .update({ settings: { ...existing, audit_streaming: config } })
        .eq('id', workspaceId)

    if (result.error) throw result.error
}

/** Send a test event to the audit streaming webhook */
export async function testAuditWebhook(
    webhookUrl: string,
): Promise<{ ok: boolean; status: number; statusText: string }> {
    const testEvent = {
        source: 'crewform',
        event_type: 'audit_log.test',
        timestamp: new Date().toISOString(),
        data: {
            action: 'test_event',
            details: { message: 'CrewForm audit log streaming test event' },
        },
    }
    try {
        const resp = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testEvent),
        })
        return { ok: resp.ok, status: resp.status, statusText: resp.statusText }
    } catch {
        return { ok: false, status: 0, statusText: 'Network error' }
    }
}

/** Fire-and-forget POST of audit entry to configured webhook */
async function dispatchAuditWebhook(
    workspaceId: string,
    entry: Record<string, unknown>,
): Promise<void> {
    try {
        const config = await fetchAuditStreamingConfig(workspaceId)
        if (!config.enabled || !config.webhookUrl) return

        await fetch(config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source: 'crewform',
                event_type: 'audit_log',
                timestamp: entry.created_at,
                data: entry,
            }),
        })
    } catch {
        // Streaming failures must never block audit writes
    }
}

// ─── Workspace Settings ─────────────────────────────────────────────────────

/** Update workspace name and slug */
export async function updateWorkspace(
    workspaceId: string,
    data: { name?: string; slug?: string },
): Promise<void> {
    const result = await supabase
        .from('workspaces')
        .update(data)
        .eq('id', workspaceId)

    if (result.error) throw result.error
}

/** Delete a workspace (owner only) */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
    const result = await supabase
        .from('workspaces')
        .delete()
        .eq('id', workspaceId)

    if (result.error) throw result.error
}
