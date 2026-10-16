// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import type { Agent, Team } from '@/types'

/**
 * Demo workspace seeding and cleanup.
 *
 * Creates a set of pre-configured agents and a pipeline team to showcase
 * CrewForm capabilities. All demo entities are tagged with 'demo' for
 * easy identification; removal uses a server-owned manifest, not these tags.
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
    description:
      'Extracts findings from supplied source material with traceable quotes and explicit gaps.',
    model: 'gpt-4o-mini',
    provider: 'openai',
    system_prompt: `You are an expert research analyst. Your job is to:

1. Analyze only the source material supplied in the task
2. Identify key findings, trends, and insights
3. Organize information into clear, structured sections
4. Clearly separate known facts from assumptions
5. Highlight any conflicting information or gaps in knowledge

Always provide:
- An executive summary (2-3 sentences)
- Key findings (bullet points)
- Detailed analysis (organized by subtopic)
- Recommendations or next steps

Use only supplied sources. Label claims without evidence as unknown; do not invent sources, statistics, or current market facts. No live web search is configured in this demo.`,
    temperature: 0.3,
    max_tokens: null,
    tags: [DEMO_TAG],
    tools: [],
  },
  {
    name: 'Content Writer',
    description:
      'Professional content writer that transforms research and ideas into polished articles, blog posts, and documentation.',
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

Preserve the supplied source IDs. Do not invent facts, statistics or general market demand. Label the result as a draft synthesis of the supplied notes for human review.`,
    temperature: 0.7,
    max_tokens: null,
    tags: [DEMO_TAG],
    tools: [],
  },
  {
    name: 'Data Analyst',
    description:
      'Data analyst that extracts insights from data, creates summaries, identifies trends, and spots anomalies.',
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
- **Metrics**: Only numbers present in the supplied sources; otherwise report unknown
- **Trends**: What's going up, down, or staying flat — and why
- **Anomalies**: Anything unexpected that needs investigation
- **Recommendations**: Data-driven suggestions for next steps

Cite supplied source IDs for every finding. Use a table when useful. Do not invent numbers, benchmarks, percentages or general market demand.`,
    temperature: 0.3,
    max_tokens: null,
    tags: [DEMO_TAG],
    tools: [],
  },
]

export interface DemoManifest {
  seed_id: string
  team: { id: string; name: string } | null
  agents: { id: string; name: string }[]
}

const DEMO_STEPS = [
  {
    agent_name: 'Research Analyst',
    step_name: 'Extract Evidence',
    instructions:
      'Read only the supplied source notes. Extract evidence, buyer pains and gaps. Cite note IDs for each finding; do not invent sources or market facts.',
    expected_output: 'Evidence table with source IDs, findings and explicit unknowns.',
    on_failure: 'retry',
    max_retries: 1,
  },
  {
    agent_name: 'Data Analyst',
    step_name: 'Analyze',
    instructions:
      'Prioritize only the supported findings. Preserve source IDs and distinguish observations from hypotheses. Unknown metrics remain unknown.',
    expected_output:
      'Prioritized opportunities, source references, risks and validation questions.',
    on_failure: 'retry',
    max_retries: 1,
  },
  {
    agent_name: 'Content Writer',
    step_name: 'Write Brief',
    instructions:
      'Write a concise draft brief using only supplied evidence and the prior analysis. Cite source IDs and include limitations. Do not add unsupported facts.',
    expected_output:
      'Markdown draft brief with evidence, unknowns and next validation questions for human review.',
    on_failure: 'stop',
    max_retries: 0,
  },
]

/** One transaction creates all three agents, team, members and tracked ownership. */
export async function seedDemoWorkspace(
  workspaceId: string,
): Promise<{ agents: Agent[]; team: Team }> {
  const response = await supabase.rpc('seed_demo_workspace', {
    p_workspace_id: workspaceId,
    p_agents: DEMO_AGENTS,
    p_steps: DEMO_STEPS,
  })
  if (response.error) throw response.error
  return response.data as { agents: Agent[]; team: Team }
}

export async function fetchDemoManifest(workspaceId: string): Promise<DemoManifest | null> {
  const response = await supabase.rpc('get_demo_workspace', { p_workspace_id: workspaceId })
  if (response.error) throw response.error
  return response.data as DemoManifest | null
}

/** Tags/settings never select records for deletion; the server checks the seed identity. */
export async function removeDemoWorkspace(workspaceId: string, seedId: string): Promise<void> {
  const response = await supabase.rpc('remove_demo_workspace', {
    p_workspace_id: workspaceId,
    p_seed_id: seedId,
  })
  if (response.error) throw response.error
}
export async function clearLegacyDemoMarker(workspaceId: string): Promise<void> {
  const response = await supabase.rpc('clear_legacy_demo_marker', { p_workspace_id: workspaceId })
  if (response.error) throw response.error
}
