// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import { enforceQuota } from '@/lib/enforceQuota'
import { savePromptVersion } from '@/db/promptHistory'
import type { Agent } from '@/types'

/**
 * Supabase data access layer for agents.
 * All agent queries go through this module (per Ticket 2.5 db.* pattern).
 */

/** Fetch all agents for a workspace */
export async function fetchAgents(workspaceId: string): Promise<Agent[]> {
    const result = await supabase
        .from('agents')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })

    if (result.error) throw result.error
    return result.data as Agent[]
}

/** Fetch a single agent by ID */
export async function fetchAgentById(id: string): Promise<Agent | null> {
    const result = await supabase
        .from('agents')
        .select('*')
        .eq('id', id)
        .single()

    if (result.error) {
        if (result.error.code === 'PGRST116') return null
        throw result.error
    }
    return result.data as Agent
}

/** Create a new agent */
export interface CreateAgentInput {
    workspace_id: string
    name: string
    description: string
    model: string
    provider: string
    system_prompt: string
    temperature: number
    max_tokens: number | null
    tags: string[]
    tools: string[]
    fallback_model?: string | null
    avatar_url?: string | null
    output_route_ids?: string[] | null
}

export async function createAgent(input: CreateAgentInput): Promise<Agent> {
    await enforceQuota(input.workspace_id, 'agents')

    const result = await supabase
        .from('agents')
        .insert(input)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as Agent
}

/** Update an existing agent */
export type UpdateAgentInput = Partial<Omit<CreateAgentInput, 'workspace_id'>>

export async function updateAgent(id: string, input: UpdateAgentInput): Promise<Agent> {
    // Snapshot old prompt if system_prompt is being changed
    if (input.system_prompt !== undefined) {
        const currentResult = await supabase
            .from('agents')
            .select('system_prompt, model, temperature')
            .eq('id', id)
            .single()

        const current = currentResult.data as { system_prompt: string; model: string; temperature: number } | null
        if (current && current.system_prompt !== input.system_prompt) {
            await savePromptVersion(id, current.system_prompt, current.model, current.temperature)
        }
    }

    const result = await supabase
        .from('agents')
        .update(input)
        .eq('id', id)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as Agent
}

/** Delete an agent */
export async function deleteAgent(id: string): Promise<void> {
    const result = await supabase
        .from('agents')
        .delete()
        .eq('id', id)

    if (result.error) throw result.error
}
