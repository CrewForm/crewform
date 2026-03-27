import { supabase } from '@/lib/supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface A2ARemoteAgent {
    id: string
    workspace_id: string
    name: string
    base_url: string
    agent_card: {
        name: string
        description?: string
        version?: string
        skills?: Array<{ id: string; name: string; description: string }>
        [key: string]: unknown
    }
    is_enabled: boolean
    created_at: string
    updated_at: string
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function fetchA2AAgents(workspaceId: string): Promise<A2ARemoteAgent[]> {
    const { data, error } = await supabase
        .from('a2a_remote_agents')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    return (data ?? []) as A2ARemoteAgent[]
}

// ─── Mutations ──────────────────────────────────────────────────────────────

/** Discover and register an external A2A agent by URL */
export async function discoverAndRegisterAgent(
    workspaceId: string,
    baseUrl: string,
): Promise<A2ARemoteAgent> {
    // Fetch the Agent Card
    const cleanUrl = baseUrl.replace(/\/$/, '')
    const cardUrl = `${cleanUrl}/.well-known/agent.json`

    const response = await fetch(cardUrl, {
        headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
        throw new Error(`Failed to fetch Agent Card: ${response.status} ${response.statusText}`)
    }

    const card = await response.json()

    if (!card.name) {
        throw new Error('Invalid Agent Card: missing name')
    }

    // Insert into database
    const { data, error } = await supabase
        .from('a2a_remote_agents')
        .insert({
            workspace_id: workspaceId,
            name: card.name,
            base_url: baseUrl,
            agent_card: card,
        })
        .select()
        .single()

    if (error) throw new Error(error.message)
    return data as A2ARemoteAgent
}

/** Toggle an agent's enabled status */
export async function toggleAgent(id: string, isEnabled: boolean): Promise<void> {
    const { error } = await supabase
        .from('a2a_remote_agents')
        .update({ is_enabled: isEnabled })
        .eq('id', id)

    if (error) throw new Error(error.message)
}

/** Delete a remote agent */
export async function deleteA2AAgent(id: string): Promise<void> {
    const { error } = await supabase
        .from('a2a_remote_agents')
        .delete()
        .eq('id', id)

    if (error) throw new Error(error.message)
}

/** Refresh an agent's cached Agent Card */
export async function refreshAgentCard(id: string, baseUrl: string): Promise<void> {
    const cleanUrl = baseUrl.replace(/\/$/, '')
    const cardUrl = `${cleanUrl}/.well-known/agent.json`

    const response = await fetch(cardUrl, {
        headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
        throw new Error(`Failed to refresh Agent Card: ${response.status}`)
    }

    const card = await response.json()

    const { error } = await supabase
        .from('a2a_remote_agents')
        .update({ agent_card: card, name: card.name })
        .eq('id', id)

    if (error) throw new Error(error.message)
}
