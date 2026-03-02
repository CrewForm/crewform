// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import { enforceQuota } from '@/lib/enforceQuota'

export type TriggerType = 'cron' | 'webhook' | 'manual'
export type TriggerLogStatus = 'fired' | 'failed'

export interface AgentTrigger {
    id: string
    agent_id: string | null
    team_id: string | null
    workspace_id: string
    trigger_type: TriggerType
    cron_expression: string | null
    webhook_token: string | null
    task_title_template: string
    task_description_template: string
    enabled: boolean
    last_fired_at: string | null
    created_at: string
}

export interface TriggerLogEntry {
    id: string
    trigger_id: string
    task_id: string | null
    fired_at: string
    status: TriggerLogStatus
    error: string | null
}

export interface CreateTriggerInput {
    agent_id: string
    workspace_id: string
    trigger_type: TriggerType
    cron_expression?: string | null
    webhook_token?: string | null
    task_title_template: string
    task_description_template?: string
    enabled?: boolean
}

/** Fetch all triggers for an agent */
export async function fetchTriggers(agentId: string): Promise<AgentTrigger[]> {
    const result = await supabase
        .from('agent_triggers')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })

    if (result.error) throw result.error
    return result.data as AgentTrigger[]
}

/** Fetch all triggers for a team */
export async function fetchTeamTriggers(teamId: string): Promise<AgentTrigger[]> {
    const result = await supabase
        .from('agent_triggers')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })

    if (result.error) throw result.error
    return result.data as AgentTrigger[]
}

/** Create a new trigger for an agent */
export async function createTrigger(input: CreateTriggerInput): Promise<AgentTrigger> {
    await enforceQuota(input.workspace_id, 'triggers')

    // Generate a webhook token if webhook type
    const data = {
        ...input,
        webhook_token: input.trigger_type === 'webhook'
            ? crypto.randomUUID()
            : null,
    }

    const result = await supabase
        .from('agent_triggers')
        .insert(data)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as AgentTrigger
}

export interface CreateTeamTriggerInput {
    team_id: string
    workspace_id: string
    trigger_type: TriggerType
    cron_expression?: string | null
    webhook_token?: string | null
    task_title_template: string
    task_description_template?: string
    enabled?: boolean
}

/** Create a new trigger for a team */
export async function createTeamTrigger(input: CreateTeamTriggerInput): Promise<AgentTrigger> {
    await enforceQuota(input.workspace_id, 'triggers')

    const data = {
        ...input,
        agent_id: null,
        webhook_token: input.trigger_type === 'webhook'
            ? crypto.randomUUID()
            : null,
    }

    const result = await supabase
        .from('agent_triggers')
        .insert(data)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as AgentTrigger
}

/** Toggle a trigger's enabled state */
export async function updateTriggerEnabled(id: string, enabled: boolean): Promise<AgentTrigger> {
    const result = await supabase
        .from('agent_triggers')
        .update({ enabled })
        .eq('id', id)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as AgentTrigger
}

/** Delete a trigger */
export async function deleteTrigger(id: string): Promise<void> {
    const result = await supabase
        .from('agent_triggers')
        .delete()
        .eq('id', id)

    if (result.error) throw result.error
}

/** Fetch trigger log entries */
export async function fetchTriggerLog(triggerId: string): Promise<TriggerLogEntry[]> {
    const result = await supabase
        .from('trigger_log')
        .select('*')
        .eq('trigger_id', triggerId)
        .order('fired_at', { ascending: false })
        .limit(20)

    if (result.error) throw result.error
    return result.data as TriggerLogEntry[]
}
