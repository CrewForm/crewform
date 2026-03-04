// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import type { Agent } from '@/types'

export type MarketplaceSortOption = 'installs' | 'rating' | 'newest'

export interface MarketplaceQueryOptions {
    search?: string
    tags?: string[]
    sort?: MarketplaceSortOption
}

// Columns to fetch for public marketplace (excludes system_prompt to protect IP)
const MARKETPLACE_AGENT_COLUMNS = [
    'id', 'workspace_id', 'name', 'description', 'avatar_url',
    'model', 'provider', 'temperature', 'max_tokens', 'tags', 'tools',
    'voice_profile', 'voice_profile_id', 'output_template_id',
    'status', 'config', 'is_published', 'marketplace_tags',
    'install_count', 'rating_avg', 'price_cents',
    'created_at', 'updated_at',
].join(',')

/** Fetch published marketplace agents with optional filtering and sorting.
 *  NOTE: system_prompt is intentionally excluded to protect agent IP. */
export async function fetchMarketplaceAgents(
    options: MarketplaceQueryOptions = {},
): Promise<Agent[]> {
    let query = supabase
        .from('agents')
        .select(MARKETPLACE_AGENT_COLUMNS)
        .eq('is_published', true)

    // Search by name or description
    if (options.search?.trim()) {
        const term = `%${options.search.trim()}%`
        query = query.or(`name.ilike.${term},description.ilike.${term}`)
    }

    // Filter by tags (agents must contain ALL selected tags)
    if (options.tags && options.tags.length > 0) {
        query = query.contains('marketplace_tags', options.tags)
    }

    // Sort
    switch (options.sort) {
        case 'rating':
            query = query.order('rating_avg', { ascending: false })
            break
        case 'newest':
            query = query.order('created_at', { ascending: false })
            break
        case 'installs':
        default:
            query = query.order('install_count', { ascending: false })
            break
    }

    const { data, error } = await query

    if (error) throw error
    return (data as unknown as Agent[]).map(a => ({ ...a, system_prompt: '' }))
}

/** Get all unique tags from published agents */
export async function fetchMarketplaceTags(): Promise<string[]> {
    const { data, error } = await supabase
        .from('agents')
        .select('marketplace_tags')
        .eq('is_published', true)

    if (error) throw error

    const tagSet = new Set<string>()
    for (const row of data as Array<{ marketplace_tags: string[] }>) {
        for (const tag of row.marketplace_tags) {
            tagSet.add(tag)
        }
    }

    return Array.from(tagSet).sort()
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SubmissionAgentData {
    name: string
    description: string
    model: string
    provider: string | null
    system_prompt: string
    temperature: number
    tools: string[]
    tags: string[]
    marketplace_tags: string[]
}

export interface MarketplaceSubmission {
    id: string
    agent_id: string
    submitted_by: string
    status: 'pending' | 'approved' | 'rejected'
    review_notes: string | null
    injection_scan_result: InjectionScanResult
    reviewed_by: string | null
    reviewed_at: string | null
    created_at: string
    // Joined
    agent_name?: string
    agent_description?: string
    agent_data?: SubmissionAgentData
}

export interface AgentReview {
    id: string
    agent_id: string
    user_id: string
    rating: number
    review_text: string
    created_at: string
    updated_at: string
}

export interface InjectionScanResult {
    safe: boolean
    flags: string[]
    aiScan?: {
        safe: boolean
        reasoning: string
        confidence: number // 0–1
    }
}

export interface CreatorStats {
    publishedCount: number
    totalInstalls: number
    avgRating: number
    submissions: MarketplaceSubmission[]
}

// ─── Prompt Injection Scan ──────────────────────────────────────────────────

const INJECTION_PATTERNS = [
    { pattern: /ignore\s+(all\s+)?previous\s+(instructions?|prompts?)/i, label: 'Ignore previous instructions' },
    { pattern: /you\s+are\s+now\s+(a|an)\s+/i, label: 'Identity override attempt' },
    { pattern: /disregard\s+(all\s+)?(prior|earlier|above)/i, label: 'Disregard prior context' },
    { pattern: /forget\s+(everything|all|your)\s/i, label: 'Memory wipe attempt' },
    { pattern: /do\s+not\s+follow\s+(any|the)\s+(rules?|instructions?)/i, label: 'Rule bypass' },
    { pattern: /pretend\s+(you|that)\s+(are|is)\s/i, label: 'Role pretending' },
    { pattern: /act\s+as\s+(if|though)\s+you\s+(have\s+)?no\s+(restrictions?|limits?)/i, label: 'Restriction removal' },
    { pattern: /override\s+(your\s+)?(safety|content\s+policy|guidelines)/i, label: 'Safety override' },
    { pattern: /jailbreak/i, label: 'Jailbreak keyword' },
    { pattern: /DAN\s*(mode)?/i, label: 'DAN mode reference' },
]

/** Scan a prompt for common injection patterns */
export function scanForInjection(prompt: string): InjectionScanResult {
    const flags: string[] = []

    for (const { pattern, label } of INJECTION_PATTERNS) {
        if (pattern.test(prompt)) {
            flags.push(label)
        }
    }

    return { safe: flags.length === 0, flags }
}

/**
 * AI-powered injection scan via Supabase Edge Function.
 * Sends the prompt to a super admin agent that analyses it for injection risks.
 * Falls back gracefully if the Edge Function is not deployed.
 */
async function aiScanForInjection(
    prompt: string,
): Promise<{ safe: boolean; reasoning: string; confidence: number }> {
    const response = await supabase.functions.invoke<{ safe: boolean; reasoning: string; confidence: number }>('ai-injection-scan', {
        body: { prompt },
    })

    if (response.error) {
        // Edge Function not deployed or unavailable — stub response
        console.warn('[AI Scan] Edge Function unavailable, using stub:', String(response.error))
        return {
            safe: true,
            reasoning: 'AI scan unavailable — skipped.',
            confidence: 0,
        }
    }

    const result = response.data
    if (!result) {
        return { safe: true, reasoning: 'AI scan returned no data.', confidence: 0 }
    }
    return {
        safe: result.safe,
        reasoning: result.reasoning,
        confidence: result.confidence,
    }
}

// ─── Publishing ─────────────────────────────────────────────────────────────

/** Submit an agent for marketplace review */
export async function submitAgentForReview(
    agentId: string,
    tags: string[],
    userId: string,
): Promise<MarketplaceSubmission> {
    // Update agent tags
    const updateResult = await supabase
        .from('agents')
        .update({ marketplace_tags: tags })
        .eq('id', agentId)

    if (updateResult.error) throw updateResult.error

    // Get the agent's prompt for injection scan
    const agentResult = await supabase
        .from('agents')
        .select('system_prompt')
        .eq('id', agentId)
        .single()

    const prompt = (agentResult.data as { system_prompt: string } | null)?.system_prompt ?? ''
    const regexScan = scanForInjection(prompt)

    // Run AI scan (non-blocking — falls back to regex-only if unavailable)
    let aiResult: InjectionScanResult['aiScan'] | undefined
    try {
        aiResult = await aiScanForInjection(prompt)
    } catch {
        // AI scan unavailable — proceed with regex-only
    }

    const combinedScan: InjectionScanResult = {
        safe: regexScan.safe && (aiResult?.safe ?? true),
        flags: regexScan.flags,
        aiScan: aiResult,
    }

    // Create submission
    const result = await supabase
        .from('marketplace_submissions')
        .insert({
            agent_id: agentId,
            submitted_by: userId,
            injection_scan_result: combinedScan,
        })
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as MarketplaceSubmission
}

/** Fetch my submissions */
export async function fetchMySubmissions(userId: string): Promise<MarketplaceSubmission[]> {
    const result = await supabase
        .from('marketplace_submissions')
        .select('*')
        .eq('submitted_by', userId)
        .order('created_at', { ascending: false })

    if (result.error) throw result.error

    const submissions = result.data as MarketplaceSubmission[]

    // Fetch agent names
    const agentIds = submissions.map(s => s.agent_id)
    if (agentIds.length > 0) {
        const agentsResult = await supabase
            .from('agents')
            .select('id, name, description')
            .in('id', agentIds)

        if (!agentsResult.error) {
            const agentMap = new Map<string, { name: string; description: string }>()
            for (const a of agentsResult.data as Array<{ id: string; name: string; description: string }>) {
                agentMap.set(a.id, a)
            }
            for (const s of submissions) {
                s.agent_name = agentMap.get(s.agent_id)?.name
                s.agent_description = agentMap.get(s.agent_id)?.description
            }
        }
    }

    return submissions
}

/** Fetch all pending submissions (admin) — includes full agent data for review */
export async function fetchPendingSubmissions(): Promise<MarketplaceSubmission[]> {
    const result = await supabase
        .from('marketplace_submissions')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

    if (result.error) throw result.error

    const submissions = result.data as MarketplaceSubmission[]

    // Fetch full agent data for review
    const agentIds = submissions.map(s => s.agent_id)
    if (agentIds.length > 0) {
        const agentsResult = await supabase
            .from('agents')
            .select('id, name, description, model, provider, system_prompt, temperature, tools, tags, marketplace_tags')
            .in('id', agentIds)

        if (!agentsResult.error) {
            const agentMap = new Map<string, SubmissionAgentData & { id: string }>()
            for (const a of agentsResult.data as Array<SubmissionAgentData & { id: string }>) {
                agentMap.set(a.id, a)
            }
            for (const s of submissions) {
                const agent = agentMap.get(s.agent_id)
                s.agent_name = agent?.name
                s.agent_description = agent?.description
                if (agent) {
                    s.agent_data = {
                        name: agent.name,
                        description: agent.description,
                        model: agent.model,
                        provider: agent.provider,
                        system_prompt: agent.system_prompt,
                        temperature: agent.temperature,
                        tools: agent.tools,
                        tags: agent.tags,
                        marketplace_tags: agent.marketplace_tags,
                    }
                }
            }
        }
    }

    return submissions
}

/** Approve a submission and publish the agent */
export async function approveSubmission(id: string, reviewerId: string): Promise<void> {
    // Get the submission to find the agent
    const subResult = await supabase
        .from('marketplace_submissions')
        .select('agent_id')
        .eq('id', id)
        .single()

    if (subResult.error) throw subResult.error
    const agentId = (subResult.data as { agent_id: string }).agent_id

    // Update submission status
    const updateResult = await supabase
        .from('marketplace_submissions')
        .update({
            status: 'approved',
            reviewed_by: reviewerId,
            reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)

    if (updateResult.error) throw updateResult.error

    // Publish the agent
    const publishResult = await supabase
        .from('agents')
        .update({ is_published: true })
        .eq('id', agentId)

    if (publishResult.error) throw publishResult.error
}

/** Reject a submission */
export async function rejectSubmission(id: string, reviewerId: string, notes: string): Promise<void> {
    const result = await supabase
        .from('marketplace_submissions')
        .update({
            status: 'rejected',
            reviewed_by: reviewerId,
            reviewed_at: new Date().toISOString(),
            review_notes: notes,
        })
        .eq('id', id)

    if (result.error) throw result.error
}

// ─── Creator Stats ──────────────────────────────────────────────────────────

/** Fetch creator statistics for published agents */
export async function fetchCreatorStats(userId: string): Promise<CreatorStats> {
    // Get published agents by this user
    const agentsResult = await supabase
        .from('agents')
        .select('install_count, rating_avg')
        .eq('workspace_id', userId) // agents belong to workspace, not user directly
        .eq('is_published', true)

    const agents = !agentsResult.error
        ? (agentsResult.data as Array<{ install_count: number; rating_avg: number }>)
        : []

    const publishedCount = agents.length
    const totalInstalls = agents.reduce((sum, a) => sum + a.install_count, 0)
    const avgRating = agents.length > 0
        ? agents.reduce((sum, a) => sum + a.rating_avg, 0) / agents.length
        : 0

    // Get submissions
    const submissions = await fetchMySubmissions(userId)

    return { publishedCount, totalInstalls, avgRating, submissions }
}

// ─── Unpublish / Admin Removal ──────────────────────────────────────────────

/** Unpublish an agent from the marketplace (owner or admin) */
export async function unpublishAgent(agentId: string): Promise<void> {
    const result = await supabase
        .from('agents')
        .update({ is_published: false })
        .eq('id', agentId)

    if (result.error) throw result.error
}

/** Fetch all published agents (admin view) */
export async function fetchPublishedAgents(): Promise<Array<{
    id: string
    name: string
    provider: string
    model: string
    install_count: number
    rating_avg: number
    workspace_id: string
    workspace_name: string
    owner_email: string
}>> {
    const result = await supabase
        .from('agents')
        .select(`
            id, name, provider, model, install_count, rating_avg, workspace_id,
            workspaces!workspace_id ( name, owner_id )
        `)
        .eq('is_published', true)
        .order('install_count', { ascending: false })

    if (result.error) throw result.error

    const raw = result.data as unknown as Array<{
        id: string
        name: string
        provider: string
        model: string
        install_count: number
        rating_avg: number
        workspace_id: string
        workspaces: { name: string; owner_id: string } | null
    }>

    // Collect unique owner IDs for email lookup
    const ownerIds = [...new Set(raw.map(r => r.workspaces?.owner_id).filter(Boolean))] as string[]
    const emailMap = new Map<string, string>()
    if (ownerIds.length > 0) {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', ownerIds)

        if (profiles) {
            for (const p of profiles as Array<{ id: string; email: string }>) {
                emailMap.set(p.id, p.email)
            }
        }
    }

    return raw.map(r => ({
        id: r.id,
        name: r.name,
        provider: r.provider,
        model: r.model,
        install_count: r.install_count,
        rating_avg: r.rating_avg,
        workspace_id: r.workspace_id,
        workspace_name: r.workspaces?.name ?? 'Unknown',
        owner_email: emailMap.get(r.workspaces?.owner_id ?? '') ?? 'Unknown',
    }))
}

// ─── Agent Ratings ──────────────────────────────────────────────────────────

/** Submit or update a rating for a marketplace agent */
export async function submitAgentRating(
    agentId: string,
    userId: string,
    workspaceId: string,
    rating: number,
    reviewText: string = '',
): Promise<AgentReview> {
    // Upsert: one review per user per agent (enforced by unique constraint)
    const result = await supabase
        .from('agent_reviews')
        .upsert(
            { agent_id: agentId, user_id: userId, workspace_id: workspaceId, rating, review_text: reviewText },
            { onConflict: 'agent_id,user_id' },
        )
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as AgentReview
}

/** Fetch all reviews for an agent */
export async function fetchAgentReviews(agentId: string): Promise<AgentReview[]> {
    const result = await supabase
        .from('agent_reviews')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })

    if (result.error) throw result.error
    return result.data as AgentReview[]
}

/** Fetch the current user's review for a specific agent (if any) */
export async function fetchUserReview(
    agentId: string,
    userId: string,
): Promise<AgentReview | null> {
    const result = await supabase
        .from('agent_reviews')
        .select('*')
        .eq('agent_id', agentId)
        .eq('user_id', userId)
        .maybeSingle()

    if (result.error) throw result.error
    return result.data as AgentReview | null
}
