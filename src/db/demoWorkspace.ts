// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import type { Agent, Team, PipelineConfig } from '@/types'

/**
 * Demo workspace seeding and cleanup.
 *
 * Creates a set of pre-configured agents and a pipeline team to showcase
 * CrewForm capabilities. All demo entities are tagged with 'demo' for
 * easy identification and one-click removal.
 *
 * NOTE: Does NOT provide LLM API keys — the user must add their own.
 */

// ─── Demo Agent Definitions ─────────────────────────────────────────────────

const DEMO_TAG = 'demo'

interface DemoAgentDef {
    name: string
    description: string
    model: string
    provider: string
    system_prompt: string
    temperature: number
    max_tokens: number | null
    tags: string[]
    tools: string[]
}

const DEMO_AGENTS: DemoAgentDef[] = [
    {
        name: 'Research Analyst',
        description: 'Expert researcher that analyzes topics, finds key insights, and provides structured summaries with sources.',
        model: 'gpt-4o-mini',
        provider: 'openai',
        system_prompt: `You are an expert research analyst. Your job is to:

1. Thoroughly research the given topic
2. Identify key findings, trends, and insights
3. Organize information into clear, structured sections
4. Clearly separate known facts from assumptions
5. Highlight any conflicting information or gaps in knowledge

Always provide:
- An executive summary (2-3 sentences)
- Key findings (bullet points)
- Detailed analysis (organized by subtopic)
- Recommendations or next steps

Be thorough, objective, and data-driven in your analysis. If live web search is not available, use your general knowledge and explicitly note where the user should verify current details.`,
        temperature: 0.3,
        max_tokens: null,
        tags: [DEMO_TAG],
        tools: [],
    },
    {
        name: 'Content Writer',
        description: 'Professional content writer that transforms research and ideas into polished articles, blog posts, and documentation.',
        model: 'gpt-4o-mini',
        provider: 'openai',
        system_prompt: `You are a professional content writer. Your job is to:

1. Transform raw research, notes, or ideas into polished written content
2. Adapt tone and style to the target audience
3. Structure content with clear headings, subheadings, and flow
4. Write engaging introductions and compelling conclusions
5. Use examples and analogies to make complex topics accessible

Guidelines:
- Write in clear, concise language
- Use active voice
- Break up long paragraphs
- Include transition sentences between sections
- End with a clear call-to-action or takeaway

You can write: blog posts, articles, documentation, newsletters, social media content, and more.`,
        temperature: 0.7,
        max_tokens: null,
        tags: [DEMO_TAG],
        tools: [],
    },
    {
        name: 'Code Reviewer',
        description: 'Senior code reviewer that analyzes code for bugs, security issues, performance problems, and adherence to best practices.',
        model: 'gpt-4o-mini',
        provider: 'openai',
        system_prompt: `You are a senior software engineer and code reviewer. Your job is to:

1. Analyze code for bugs, logic errors, and edge cases
2. Identify security vulnerabilities (injection, XSS, auth issues, etc.)
3. Spot performance bottlenecks and suggest optimizations
4. Check adherence to coding best practices and design patterns
5. Suggest improvements for readability, maintainability, and testability

For each issue found, provide:
- **Severity**: Critical / High / Medium / Low
- **Location**: File and line reference
- **Issue**: Clear description of the problem
- **Fix**: Suggested code change or approach

Be constructive and educational — explain *why* something is an issue, not just *what* to change.`,
        temperature: 0.2,
        max_tokens: null,
        tags: [DEMO_TAG],
        tools: [],
    },
    {
        name: 'Data Analyst',
        description: 'Data analyst that extracts insights from data, creates summaries, identifies trends, and spots anomalies.',
        model: 'gpt-4o-mini',
        provider: 'openai',
        system_prompt: `You are a data analyst. Your job is to:

1. Analyze provided data sets, tables, or metrics
2. Identify trends, patterns, and anomalies
3. Calculate key statistics and summarize findings
4. Create clear visualizations descriptions (charts, tables)
5. Provide actionable insights and recommendations

Always include:
- **Summary**: Key takeaways in 2-3 sentences
- **Metrics**: Important numbers with context (vs. benchmarks, vs. last period)
- **Trends**: What's going up, down, or staying flat — and why
- **Anomalies**: Anything unexpected that needs investigation
- **Recommendations**: Data-driven suggestions for next steps

Present data clearly. Use tables, percentages, and comparisons to make numbers meaningful.`,
        temperature: 0.3,
        max_tokens: null,
        tags: [DEMO_TAG],
        tools: [],
    },
    {
        name: 'Email Drafter',
        description: 'Professional email writer that drafts clear, concise emails with appropriate tone for any audience.',
        model: 'gpt-4o-mini',
        provider: 'openai',
        system_prompt: `You are a professional email writer. Your job is to:

1. Draft clear, concise, and well-structured emails
2. Match the tone to the audience (formal, friendly, urgent, etc.)
3. Include a clear subject line
4. Get to the point quickly
5. End with a clear call-to-action

Email types you handle:
- Professional outreach and introductions
- Follow-ups and check-ins
- Status updates and reports
- Meeting requests and agendas
- Thank you notes and feedback
- Newsletter summaries

Guidelines:
- Keep paragraphs short (2-3 sentences max)
- Use bullet points for lists
- Bold key information
- Always include a specific next step or ask`,
        temperature: 0.5,
        max_tokens: null,
        tags: [DEMO_TAG],
        tools: [],
    },
]

// ─── Seeding ────────────────────────────────────────────────────────────────

/**
 * Seed a workspace with demo agents and a pipeline team.
 * Skips quota enforcement since demo agents are temporary.
 */
export async function seedDemoWorkspace(workspaceId: string): Promise<{
    agents: Agent[]
    team: Team
}> {
    // 1. Insert demo agents (bypass enforceQuota — demo data shouldn't count)
    const agentInserts = DEMO_AGENTS.map((def) => ({
        workspace_id: workspaceId,
        ...def,
    }))

    const agentsResult = await supabase
        .from('agents')
        .insert(agentInserts)
        .select()

    if (agentsResult.error) throw agentsResult.error
    const agents = agentsResult.data as Agent[]

    // Build a lookup for pipeline step wiring
    const agentByName = new Map<string, Agent>()
    for (const agent of agents) {
        agentByName.set(agent.name, agent)
    }

    const researcher = agentByName.get('Research Analyst')
    const analyst = agentByName.get('Data Analyst')
    const writer = agentByName.get('Content Writer')

    if (!researcher || !analyst || !writer) {
        throw new Error('Demo agent seeding failed: missing expected agents')
    }

    // 2. Create the pipeline team
    const pipelineConfig: PipelineConfig = {
        steps: [
            {
                agent_id: researcher.id,
                step_name: 'Research',
                instructions: 'Research the topic thoroughly. Identify the market, major categories, buyer pains, adoption drivers, risks, and assumptions that should be verified.',
                expected_output: 'A structured research brief with market context, key findings, trends, assumptions, and verification notes.',
                on_failure: 'retry',
                max_retries: 1,
            },
            {
                agent_id: analyst.id,
                step_name: 'Analyze',
                instructions: 'Analyze the research output. Prioritize insights by business impact, identify opportunities, and produce a concise outline for an executive brief.',
                expected_output: 'Prioritized insights, opportunity areas, risks, and a recommended executive brief structure.',
                on_failure: 'retry',
                max_retries: 1,
            },
            {
                agent_id: writer.id,
                step_name: 'Write Brief',
                instructions: 'Turn the research and analysis into a polished executive brief in markdown. Keep it structured, practical, and easy to scan.',
                expected_output: 'A publication-ready executive brief with summary, findings, opportunities, risks, and next steps.',
                on_failure: 'stop',
                max_retries: 0,
            },
        ],
        auto_handoff: true,
    }

    const teamResult = await supabase
        .from('teams')
        .insert({
            workspace_id: workspaceId,
            name: 'Research Brief Pipeline',
            description: 'Golden path demo: Research → Analyze → Write Brief. Turns a topic into a structured executive brief.',
            mode: 'pipeline' as const,
            config: pipelineConfig,
        })
        .select()
        .single()

    if (teamResult.error) throw teamResult.error
    const team = teamResult.data as Team

    // 3. Add team members
    const teamMembers = [
        { team_id: team.id, agent_id: researcher.id, role: 'worker' as const, position: 0 },
        { team_id: team.id, agent_id: analyst.id, role: 'worker' as const, position: 1 },
        { team_id: team.id, agent_id: writer.id, role: 'worker' as const, position: 2 },
    ]

    const membersResult = await supabase
        .from('team_members')
        .insert(teamMembers)

    if (membersResult.error) throw membersResult.error

    // 4. Update workspace settings to mark demo as seeded
    await updateDemoSetting(workspaceId, true, team.id)

    return { agents, team }
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

/**
 * Remove all demo data from a workspace — agents, teams, and team members.
 */
export async function removeDemoWorkspace(workspaceId: string): Promise<void> {
    // 1. Find all demo agents
    const agentsResult = await supabase
        .from('agents')
        .select('id')
        .eq('workspace_id', workspaceId)
        .contains('tags', [DEMO_TAG])

    if (agentsResult.error) throw agentsResult.error
    const demoAgentIds = (agentsResult.data as Array<{ id: string }>).map((a) => a.id)

    // 2. Read the stored demo team ID from settings
    const wsResult = await supabase
        .from('workspaces')
        .select('settings')
        .eq('id', workspaceId)
        .single()

    const settings = (wsResult.data as Record<string, unknown> | null)?.settings as Record<string, unknown> | null
    const demoTeamId = settings?.demo_team_id as string | undefined

    // 3. Delete the demo team (cascade removes team_members)
    if (demoTeamId) {
        await supabase.from('teams').delete().eq('id', demoTeamId)
    }

    // 4. Delete all demo-tagged agents
    if (demoAgentIds.length > 0) {
        await supabase.from('agents').delete().in('id', demoAgentIds)
    }

    // 5. Clear demo flag in workspace settings
    await updateDemoSetting(workspaceId, false, undefined)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function updateDemoSetting(
    workspaceId: string,
    seeded: boolean,
    teamId: string | undefined,
): Promise<void> {
    // Read → merge → write (same pattern as audit streaming config)
    const current = await supabase
        .from('workspaces')
        .select('settings')
        .eq('id', workspaceId)
        .single()

    const row = current.data as Record<string, unknown> | null
    const existing: Record<string, unknown> = (row?.settings as Record<string, unknown> | null) ?? {}

    const updatedSettings = {
        ...existing,
        demo_seeded: seeded,
        demo_team_id: teamId ?? null,
    }

    const result = await supabase
        .from('workspaces')
        .update({ settings: updatedSettings })
        .eq('id', workspaceId)

    if (result.error) throw result.error
}
