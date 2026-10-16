// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'

export interface PromptVersion {
    id: string
    agent_id: string
    version: number
    system_prompt: string
    model: string | null
    temperature: number | null
    changed_at: string
}

/** Fetch all prompt versions for an agent, newest first */
export async function fetchPromptHistory(agentId: string): Promise<PromptVersion[]> {
    const result = await supabase
        .from('agent_prompt_history')
        .select('*')
        .eq('agent_id', agentId)
        .order('version', { ascending: false })

    if (result.error) throw result.error
    return result.data as PromptVersion[]
}

/** Save a prompt version snapshot. Auto-increments version number. */
export async function savePromptVersion(
    agentId: string,
    systemPrompt: string,
    model: string | null,
    temperature: number | null,
): Promise<void> {
    // Get the latest version number for this agent
    const latestResult = await supabase
        .from('agent_prompt_history')
        .select('version')
        .eq('agent_id', agentId)
        .order('version', { ascending: false })
        .limit(1)

    const latestVersion = (latestResult.data as { version: number }[] | null)?.[0]?.version ?? 0
    const nextVersion = latestVersion + 1

    const result = await supabase
        .from('agent_prompt_history')
        .insert({
            agent_id: agentId,
            version: nextVersion,
            system_prompt: systemPrompt,
            model,
            temperature,
        })

    if (result.error) throw result.error
}
