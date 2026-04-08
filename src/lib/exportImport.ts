// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// exportImport.ts — Export agents and teams as portable JSON files,
// and import them back into a workspace.

import { supabase } from '@/lib/supabase'
import type { Agent, Team, TeamMember } from '@/types'

// ─── Export Format ──────────────────────────────────────────────────────────

export interface CrewFormExport {
    /** Format identifier */
    format: 'crewform-export'
    /** Schema version for forward compatibility */
    version: 1
    /** ISO 8601 timestamp of when the export was created */
    exported_at: string
    /** What is being exported */
    type: 'agent' | 'team'
    /** The exported data */
    data: AgentExport | TeamExport
}

export interface AgentExport {
    name: string
    description: string
    model: string
    fallback_model: string | null
    provider: string | null
    system_prompt: string
    temperature: number
    max_tokens: number | null
    tags: string[]
    tools: string[]
    voice_profile: Agent['voice_profile']
    config: Record<string, unknown>
}

export interface TeamExport {
    name: string
    description: string
    mode: string
    config: Team['config']
    /** Inline agent exports for each member so the team is self-contained */
    agents: Array<{
        /** The agent's original ID (used to link members to agents) */
        ref_id: string
        role: string
        position: number
        agent: AgentExport
    }>
}

// ─── Export Functions ────────────────────────────────────────────────────────

/** Export an agent as a portable JSON object */
export function exportAgent(agent: Agent): CrewFormExport {
    return {
        format: 'crewform-export',
        version: 1,
        exported_at: new Date().toISOString(),
        type: 'agent',
        data: {
            name: agent.name,
            description: agent.description,
            model: agent.model,
            fallback_model: agent.fallback_model,
            provider: agent.provider,
            system_prompt: agent.system_prompt,
            temperature: agent.temperature,
            max_tokens: agent.max_tokens,
            tags: agent.tags,
            tools: agent.tools,
            voice_profile: agent.voice_profile,
            config: agent.config,
        },
    }
}

/** Export a team with all its member agents as a self-contained JSON object */
export async function exportTeam(team: Team): Promise<CrewFormExport> {
    // Fetch team members
    const { data: members, error: membersError } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', team.id)
        .order('position', { ascending: true })

    if (membersError) throw new Error(`Failed to fetch team members: ${membersError.message}`)

    const teamMembers = members as TeamMember[]

    // Fetch all agents referenced by the team config + members
    const agentIds = new Set<string>()

    // From team members
    for (const m of teamMembers) {
        agentIds.add(m.agent_id)
    }

    // From config (pipeline steps, orchestrator brain, collaboration agents)
    const config = team.config
    if ('steps' in config) {
        for (const step of config.steps) {
            agentIds.add(step.agent_id)
            if (step.reviewer_agent_id) agentIds.add(step.reviewer_agent_id)
            if (step.parallel_agents) step.parallel_agents.forEach(id => agentIds.add(id))
            if (step.merge_agent_id) agentIds.add(step.merge_agent_id)
        }
    }
    if ('brain_agent_id' in config && config.brain_agent_id) {
        agentIds.add(config.brain_agent_id)
    }
    if ('worker_agent_ids' in config && Array.isArray(config.worker_agent_ids)) {
        config.worker_agent_ids.forEach(id => agentIds.add(id))
    }
    if ('agent_ids' in config && Array.isArray(config.agent_ids)) {
        config.agent_ids.forEach(id => agentIds.add(id))
    }
    if ('facilitator_agent_id' in config && config.facilitator_agent_id) {
        agentIds.add(config.facilitator_agent_id)
    }

    // Fetch all agents
    const uniqueIds = Array.from(agentIds)
    const { data: agentsData, error: agentsError } = await supabase
        .from('agents')
        .select('*')
        .in('id', uniqueIds)

    if (agentsError) throw new Error(`Failed to fetch agents: ${agentsError.message}`)

    const agents = agentsData as Agent[]
    const agentMap = new Map(agents.map(a => [a.id, a]))

    // Build agent entries — use members first, then add any agents from config not in members
    const agentEntries: TeamExport['agents'] = []
    const includedAgentIds = new Set<string>()

    for (const m of teamMembers) {
        const agent = agentMap.get(m.agent_id)
        if (!agent) continue
        includedAgentIds.add(m.agent_id)
        agentEntries.push({
            ref_id: m.agent_id,
            role: m.role,
            position: m.position,
            agent: {
                name: agent.name,
                description: agent.description,
                model: agent.model,
                fallback_model: agent.fallback_model,
                provider: agent.provider,
                system_prompt: agent.system_prompt,
                temperature: agent.temperature,
                max_tokens: agent.max_tokens,
                tags: agent.tags,
                tools: agent.tools,
                voice_profile: agent.voice_profile,
                config: agent.config,
            },
        })
    }

    // Add any agents from config that weren't in members (e.g., brain agent, facilitator)
    for (const agentId of uniqueIds) {
        if (includedAgentIds.has(agentId)) continue
        const agent = agentMap.get(agentId)
        if (!agent) continue
        agentEntries.push({
            ref_id: agentId,
            role: 'worker',
            position: agentEntries.length,
            agent: {
                name: agent.name,
                description: agent.description,
                model: agent.model,
                fallback_model: agent.fallback_model,
                provider: agent.provider,
                system_prompt: agent.system_prompt,
                temperature: agent.temperature,
                max_tokens: agent.max_tokens,
                tags: agent.tags,
                tools: agent.tools,
                voice_profile: agent.voice_profile,
                config: agent.config,
            },
        })
    }

    return {
        format: 'crewform-export',
        version: 1,
        exported_at: new Date().toISOString(),
        type: 'team',
        data: {
            name: team.name,
            description: team.description,
            mode: team.mode,
            config: team.config,
            agents: agentEntries,
        },
    }
}

// ─── Import Functions ───────────────────────────────────────────────────────

/** Import an agent from an export JSON into a workspace */
export async function importAgent(
    workspaceId: string,
    agentData: AgentExport,
): Promise<string> {
    const { data, error } = await supabase
        .from('agents')
        .insert({
            workspace_id: workspaceId,
            name: `${agentData.name} (imported)`,
            description: agentData.description,
            model: agentData.model,
            fallback_model: agentData.fallback_model,
            provider: agentData.provider,
            system_prompt: agentData.system_prompt,
            temperature: agentData.temperature,
            max_tokens: agentData.max_tokens,
            tags: agentData.tags,
            tools: agentData.tools.filter(t => !t.startsWith('custom:')), // strip custom tools, not portable
            voice_profile: agentData.voice_profile,
            config: agentData.config,
        })
        .select('id')
        .single()

    if (error) throw new Error(`Failed to import agent: ${error.message}`)
    return (data as { id: string }).id
}

/** Import a team with all its agents from an export JSON into a workspace */
export async function importTeam(
    workspaceId: string,
    teamData: TeamExport,
): Promise<string> {
    // 1. Import all agents and build old_id → new_id map
    const idMap = new Map<string, string>()

    for (const entry of teamData.agents) {
        const newId = await importAgent(workspaceId, entry.agent)
        idMap.set(entry.ref_id, newId)
    }

    // 2. Rewrite config with new agent IDs
    const newConfig = rewriteConfigIds(teamData.config, idMap)

    // 3. Create the team
    const { data: teamRow, error: teamError } = await supabase
        .from('teams')
        .insert({
            workspace_id: workspaceId,
            name: `${teamData.name} (imported)`,
            description: teamData.description,
            mode: teamData.mode,
            config: newConfig,
        })
        .select('id')
        .single()

    if (teamError) throw new Error(`Failed to import team: ${teamError.message}`)

    const teamId = (teamRow as { id: string }).id

    // 4. Create team_members
    for (const entry of teamData.agents) {
        const newAgentId = idMap.get(entry.ref_id)
        if (!newAgentId) continue

        await supabase.from('team_members').insert({
            team_id: teamId,
            agent_id: newAgentId,
            role: entry.role,
            position: entry.position,
            config: {},
        })
    }

    return teamId
}

/** Replace agent IDs in team config using an old→new id map */
function rewriteConfigIds(
    config: Team['config'],
    idMap: Map<string, string>,
): Team['config'] {
    // Deep clone to avoid mutations
    const c = JSON.parse(JSON.stringify(config)) as Record<string, unknown>

    function replaceId(id: string): string {
        return idMap.get(id) ?? id
    }

    // Pipeline steps
    if ('steps' in c && Array.isArray(c.steps)) {
        for (const step of c.steps as Record<string, unknown>[]) {
            if (typeof step.agent_id === 'string') step.agent_id = replaceId(step.agent_id)
            if (typeof step.reviewer_agent_id === 'string') step.reviewer_agent_id = replaceId(step.reviewer_agent_id)
            if (typeof step.merge_agent_id === 'string') step.merge_agent_id = replaceId(step.merge_agent_id)
            if (Array.isArray(step.parallel_agents)) {
                step.parallel_agents = (step.parallel_agents as string[]).map(replaceId)
            }
        }
    }

    // Orchestrator
    if (typeof c.brain_agent_id === 'string') c.brain_agent_id = replaceId(c.brain_agent_id)
    if (Array.isArray(c.worker_agent_ids)) {
        c.worker_agent_ids = (c.worker_agent_ids as string[]).map(replaceId)
    }

    // Collaboration
    if (Array.isArray(c.agent_ids)) {
        c.agent_ids = (c.agent_ids as string[]).map(replaceId)
    }
    if (typeof c.facilitator_agent_id === 'string') {
        c.facilitator_agent_id = replaceId(c.facilitator_agent_id)
    }

    return c as unknown as Team['config']
}

// ─── Download Helper ────────────────────────────────────────────────────────

/** Trigger browser download of a JSON export */
export function downloadExport(exportData: CrewFormExport) {
    const name = 'data' in exportData ? (exportData.data as { name: string }).name : 'export'
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const filename = `crewform-${exportData.type}-${safeName}.json`

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

/** Parse and validate an imported JSON file */
export function parseExportFile(json: string): CrewFormExport {
    const parsed: unknown = JSON.parse(json)
    const obj = parsed as Record<string, unknown>

    if (obj.format !== 'crewform-export') {
        throw new Error('Invalid file format. Expected a CrewForm export file.')
    }
    if (typeof obj.version !== 'number' || obj.version > 1) {
        throw new Error(`Unsupported export version: ${String(obj.version)}. Please update CrewForm.`)
    }
    if (obj.type !== 'agent' && obj.type !== 'team') {
        throw new Error(`Unknown export type: ${String(obj.type)}`)
    }

    return obj as unknown as CrewFormExport
}
