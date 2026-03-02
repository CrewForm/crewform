// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import { enforceQuota } from '@/lib/enforceQuota'
import type { Agent } from '@/types'

export interface InstallResult {
    clonedAgent: Agent
    installId: string
}

/**
 * Install a marketplace agent into the user's workspace.
 *
 * 1. Fetch source agent
 * 2. Clone into target workspace (new ID, is_published: false)
 * 3. Increment source agent's install_count
 * 4. Record in agent_installs
 */
export async function installMarketplaceAgent(
    agentId: string,
    workspaceId: string,
    userId: string,
): Promise<InstallResult> {
    // 1. Fetch source agent
    const fetchResult = await supabase
        .from('agents')
        .select('*')
        .eq('id', agentId)
        .eq('is_published', true)
        .single()

    if (fetchResult.error || !fetchResult.data) {
        throw new Error('Agent not found or is not published')
    }

    const sourceAgent = fetchResult.data as Agent

    // Check agent quota before cloning
    await enforceQuota(workspaceId, 'agents')

    // 2. Clone agent into user's workspace
    const cloneResult = await supabase
        .from('agents')
        .insert({
            workspace_id: workspaceId,
            name: sourceAgent.name,
            description: sourceAgent.description,
            avatar_url: sourceAgent.avatar_url,
            model: sourceAgent.model,
            provider: sourceAgent.provider,
            system_prompt: sourceAgent.system_prompt,
            temperature: sourceAgent.temperature,
            tools: sourceAgent.tools,
            config: sourceAgent.config,
            status: 'idle',
            // Not published — it's the user's private copy
            is_published: false,
            marketplace_tags: [],
            install_count: 0,
            rating_avg: 0,
        })
        .select()
        .single()

    if (cloneResult.error || !cloneResult.data) {
        throw new Error(`Failed to clone agent: ${cloneResult.error?.message ?? 'Unknown error'}`)
    }

    const clonedAgent = cloneResult.data as Agent

    // 3. Increment source agent's install_count
    await supabase.rpc('increment_install_count', { agent_row_id: agentId }).then(({ error }) => {
        if (error) {
            // Non-fatal — log but don't fail the install
            console.error('[InstallAgent] Failed to increment install_count:', error.message)
        }
    })

    // 4. Record in agent_installs
    const installResult = await supabase
        .from('agent_installs')
        .insert({
            agent_id: agentId,
            workspace_id: workspaceId,
            installed_by: userId,
            source_workspace_id: sourceAgent.workspace_id,
            cloned_agent_id: clonedAgent.id,
        })
        .select('id')
        .single()

    if (installResult.error) {
        console.error('[InstallAgent] Failed to record install:', installResult.error.message)
    }

    return {
        clonedAgent,
        installId: (installResult.data as { id: string } | null)?.id ?? '',
    }
}
