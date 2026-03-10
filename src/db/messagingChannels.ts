// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ChannelPlatform = 'telegram' | 'discord' | 'slack' | 'email' | 'trello'

export interface MessagingChannel {
    id: string
    workspace_id: string
    platform: ChannelPlatform
    name: string
    config: Record<string, unknown>
    default_agent_id: string | null
    default_team_id: string | null
    is_active: boolean
    is_managed: boolean
    connect_code: string | null
    platform_chat_id: string | null
    created_at: string
    updated_at: string
}

export interface CreateChannelInput {
    workspace_id: string
    platform: ChannelPlatform
    name: string
    config: Record<string, unknown>
    default_agent_id?: string | null
    default_team_id?: string | null
    is_managed?: boolean
    connect_code?: string | null
}

export interface UpdateChannelInput {
    name?: string
    config?: Record<string, unknown>
    default_agent_id?: string | null
    default_team_id?: string | null
    is_active?: boolean
}

export interface ChannelMessageLog {
    id: string
    channel_id: string
    direction: 'inbound' | 'outbound'
    task_id: string | null
    team_run_id: string | null
    message_preview: string | null
    status: 'delivered' | 'failed'
    error: string | null
    created_at: string
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function fetchChannels(workspaceId: string): Promise<MessagingChannel[]> {
    const result = await supabase
        .from('messaging_channels')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })

    if (result.error) throw new Error(result.error.message)
    return (result.data) as MessagingChannel[]
}

export async function createChannel(input: CreateChannelInput): Promise<MessagingChannel> {
    const result = await supabase
        .from('messaging_channels')
        .insert(input)
        .select()
        .single()

    if (result.error) throw new Error(result.error.message)
    return result.data as MessagingChannel
}

export async function updateChannel(id: string, input: UpdateChannelInput): Promise<MessagingChannel> {
    const result = await supabase
        .from('messaging_channels')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

    if (result.error) throw new Error(result.error.message)
    return result.data as MessagingChannel
}

export async function deleteChannel(id: string): Promise<void> {
    const { error } = await supabase
        .from('messaging_channels')
        .delete()
        .eq('id', id)

    if (error) throw new Error(error.message)
}

export async function fetchChannelLogs(channelId: string, limit = 20): Promise<ChannelMessageLog[]> {
    const result = await supabase
        .from('channel_message_log')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (result.error) throw new Error(result.error.message)
    return (result.data) as ChannelMessageLog[]
}
