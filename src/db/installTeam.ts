// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import { enforceQuota } from '@/lib/enforceQuota'
import { importTeam } from '@/lib/exportImport'
import type { Team, TeamMember, Agent } from '@/types'
import type { TeamExport, AgentExport } from '@/lib/exportImport'

export interface TeamInstallResult {
    clonedTeamId: string
    installId: string
}

/**
 * Install a marketplace team into the user's workspace.
 *
 * 1. Fetch source team + members + agents
 * 2. Build a TeamExport object (same format as exportImport.ts)
 * 3. Use importTeam() to clone everything with ID remapping
 * 4. Increment source team's install_count
 * 5. Record in team_installs
 */
export async function installMarketplaceTeam(
    teamId: string,
    workspaceId: string,
    userId: string,
): Promise<TeamInstallResult> {
    // 1. Fetch source team
    const result = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .eq('is_published', true)
        .single()

    if (result.error || !result.data) {
        throw new Error('Team not found or is not published')
    }

    const sourceTeam = result.data as Team



    // Check team quota before cloning
    await enforceQuota(workspaceId, 'teams')

    // 2. Fetch team members
    const { data: membersData, error: membersError } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .order('position', { ascending: true })

    if (membersError) throw new Error(`Failed to fetch team members: ${membersError.message}`)
    const members = membersData as TeamMember[]

    // 3. Collect all referenced agent IDs
    const agentIds = new Set<string>()
    for (const m of members) agentIds.add(m.agent_id)

    const config = sourceTeam.config
    if ('steps' in config) {
        for (const step of config.steps) {
            agentIds.add(step.agent_id)
            if (step.reviewer_agent_id) agentIds.add(step.reviewer_agent_id)
            if (step.parallel_agents) step.parallel_agents.forEach(id => agentIds.add(id))
            if (step.merge_agent_id) agentIds.add(step.merge_agent_id)
        }
    }
    if ('brain_agent_id' in config && config.brain_agent_id) agentIds.add(config.brain_agent_id)
    if ('worker_agent_ids' in config && Array.isArray(config.worker_agent_ids)) {
        config.worker_agent_ids.forEach(id => agentIds.add(id))
    }
    if ('agent_ids' in config && Array.isArray(config.agent_ids)) {
        config.agent_ids.forEach((id: string) => agentIds.add(id))
    }
    if ('facilitator_agent_id' in config && typeof config.facilitator_agent_id === 'string') {
        agentIds.add(config.facilitator_agent_id)
    }

    // 4. Fetch all agents
    const { data: agentsData, error: agentsError } = await supabase
        .from('agents')
        .select('*')
        .in('id', Array.from(agentIds))

    if (agentsError) throw new Error(`Failed to fetch agents: ${agentsError.message}`)
    const agents = agentsData as Agent[]
    const agentMap = new Map(agents.map(a => [a.id, a]))

    // 5. Build TeamExport for importTeam()
    const agentEntries: TeamExport['agents'] = []
    const includedIds = new Set<string>()

    for (const m of members) {
        const agent = agentMap.get(m.agent_id)
        if (!agent) continue
        includedIds.add(m.agent_id)
        agentEntries.push({
            ref_id: m.agent_id,
            role: m.role,
            position: m.position,
            agent: agentToExport(agent),
        })
    }

    // Add config-only agents not in members
    for (const id of agentIds) {
        if (includedIds.has(id)) continue
        const agent = agentMap.get(id)
        if (!agent) continue
        agentEntries.push({
            ref_id: id,
            role: 'worker',
            position: agentEntries.length,
            agent: agentToExport(agent),
        })
    }

    const teamExport: TeamExport = {
        name: sourceTeam.name,
        description: sourceTeam.description,
        mode: sourceTeam.mode,
        config: sourceTeam.config,
        agents: agentEntries,
    }

    // 6. Import team (handles agent cloning + ID remapping)
    const clonedTeamId = await importTeam(workspaceId, teamExport)

    // 7. Increment source team's install_count
    await supabase.rpc('increment_team_install_count', { team_row_id: teamId }).then(({ error }) => {
        if (error) console.error('[InstallTeam] Failed to increment install_count:', error.message)
    })

    // 8. Record in team_installs
    const installResult = await supabase
        .from('team_installs')
        .insert({
            team_id: teamId,
            workspace_id: workspaceId,
            installed_by: userId,
            source_workspace_id: sourceTeam.workspace_id,
            cloned_team_id: clonedTeamId,
        })
        .select('id')
        .single()

    if (installResult.error) {
        console.error('[InstallTeam] Failed to record install:', installResult.error.message)
    }

    return {
        clonedTeamId,
        installId: (installResult.data as { id: string } | null)?.id ?? '',
    }
}

function agentToExport(agent: Agent): AgentExport {
    return {
        name: agent.name,
        description: agent.description,
        model: agent.model,
        fallback_model: agent.fallback_model,
        provider: agent.provider,
        system_prompt: agent.system_prompt, // Include prompts — team needs to be functional
        temperature: agent.temperature,
        max_tokens: agent.max_tokens,
        tags: agent.tags,
        tools: agent.tools,
        voice_profile: agent.voice_profile,
        config: agent.config,
    }
}
