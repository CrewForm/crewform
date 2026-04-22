// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import type {
    WorkflowTemplate,
    TemplateDefinition,
    TemplateVariable,
    PipelineConfig,
    PipelineStep,
    Agent,
} from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WorkflowTemplateQueryOptions {
    search?: string
    category?: string
    tag?: string
    sort?: 'installs' | 'newest' | 'name'
    limit?: number
}

export interface CreateWorkflowTemplateInput {
    workspace_id: string
    name: string
    description: string
    readme?: string
    category: string
    tags?: string[]
    icon?: string
    template_definition: TemplateDefinition
    variables: TemplateVariable[]
    is_published?: boolean
}

export interface InstallResult {
    agents: Agent[]
    teamId: string | null
    triggerId: string | null
}

// ─── Variable Resolution ────────────────────────────────────────────────────

/**
 * Replace all {{variable}} placeholders in a string with resolved values.
 */
function resolveString(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`)
}

/**
 * Deep-resolve all string values in a JSON-serializable object.
 */
function resolveObject<T>(obj: T, vars: Record<string, string>): T {
    const json = JSON.stringify(obj)
    const resolved = resolveString(json, vars)
    return JSON.parse(resolved) as T
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

/** Fetch published workflow templates for marketplace browse */
export async function fetchPublishedTemplates(
    options: WorkflowTemplateQueryOptions = {},
): Promise<WorkflowTemplate[]> {
    let query = supabase
        .from('workflow_templates')
        .select('*')
        .eq('is_published', true)

    if (options.search) {
        query = query.or(
            `name.ilike.%${options.search}%,description.ilike.%${options.search}%`,
        )
    }

    if (options.category) {
        query = query.eq('category', options.category)
    }

    if (options.tag) {
        query = query.contains('tags', [options.tag])
    }

    switch (options.sort) {
        case 'installs':
            query = query.order('install_count', { ascending: false })
            break
        case 'newest':
            query = query.order('created_at', { ascending: false })
            break
        case 'name':
            query = query.order('name', { ascending: true })
            break
        default:
            query = query.order('install_count', { ascending: false })
    }

    if (options.limit) {
        query = query.limit(options.limit)
    }

    const result = await query
    if (result.error) throw result.error
    return result.data as WorkflowTemplate[]
}

/** Fetch a single template by ID */
export async function fetchTemplateById(id: string): Promise<WorkflowTemplate | null> {
    const result = await supabase
        .from('workflow_templates')
        .select('*')
        .eq('id', id)
        .single()

    if (result.error) {
        if (result.error.code === 'PGRST116') return null
        throw result.error
    }
    return result.data as WorkflowTemplate
}

/** Fetch templates created by a workspace */
export async function fetchWorkspaceTemplates(workspaceId: string): Promise<WorkflowTemplate[]> {
    const result = await supabase
        .from('workflow_templates')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })

    if (result.error) throw result.error
    return result.data as WorkflowTemplate[]
}

/** Fetch unique categories from published templates */
export async function fetchTemplateCategories(): Promise<string[]> {
    const result = await supabase
        .from('workflow_templates')
        .select('category')
        .eq('is_published', true)

    if (result.error) throw result.error

    const categories = new Set(
        (result.data as { category: string }[]).map((r) => r.category),
    )
    return [...categories].sort()
}

// ─── Create / Update / Delete ───────────────────────────────────────────────

/** Create a new workflow template */
export async function createWorkflowTemplate(
    input: CreateWorkflowTemplateInput,
): Promise<WorkflowTemplate> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const result = await supabase
        .from('workflow_templates')
        .insert({
            ...input,
            creator_id: user.id,
        })
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as WorkflowTemplate
}

/** Update a workflow template */
export async function updateWorkflowTemplate(
    id: string,
    updates: Partial<Omit<CreateWorkflowTemplateInput, 'workspace_id'>>,
): Promise<WorkflowTemplate> {
    const result = await supabase
        .from('workflow_templates')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as WorkflowTemplate
}

/** Delete a workflow template */
export async function deleteWorkflowTemplate(id: string): Promise<void> {
    const result = await supabase
        .from('workflow_templates')
        .delete()
        .eq('id', id)

    if (result.error) throw result.error
}

// ─── Install Template ───────────────────────────────────────────────────────

/**
 * Install a workflow template into a workspace.
 *
 * 1. Resolve all {{variable}} placeholders in the template definition
 * 2. Create agent(s)
 * 3. Create team + wire agents as members (if defined)
 * 4. Create CRON/webhook trigger (if defined)
 * 5. Increment install_count
 */
export async function installTemplate(
    templateId: string,
    workspaceId: string,
    variableValues: Record<string, string>,
): Promise<InstallResult> {
    // 1. Fetch the template
    const template = await fetchTemplateById(templateId)
    if (!template) throw new Error('Template not found')

    // 2. Resolve variables in the full definition
    const resolved = resolveObject(template.template_definition, variableValues)

    // 3. Create agents
    const createdAgents: Agent[] = []
    for (const agentDef of resolved.agents) {
        const result = await supabase
            .from('agents')
            .insert({
                workspace_id: workspaceId,
                name: agentDef.name,
                description: agentDef.description,
                system_prompt: agentDef.system_prompt,
                model: agentDef.model,
                provider: agentDef.provider,
                temperature: agentDef.temperature,
                max_tokens: agentDef.max_tokens,
                tags: [...agentDef.tags, 'template'],
                tools: agentDef.tools,
            })
            .select()
            .single()

        if (result.error) throw result.error
        createdAgents.push(result.data as Agent)
    }

    // 4. Create team + wire members (if defined)
    let teamId: string | null = null
    if (resolved.team) {
        const teamDef = resolved.team

        // Build pipeline config with real agent IDs
        const steps: PipelineStep[] = teamDef.steps.map((step) => ({
            agent_id: createdAgents[step.agent_index]?.id ?? '',
            step_name: step.step_name,
            instructions: step.instructions,
            expected_output: step.expected_output,
            on_failure: 'retry' as const,
            max_retries: 1,
        }))

        const config: PipelineConfig = {
            steps,
            auto_handoff: true,
        }

        const teamResult = await supabase
            .from('teams')
            .insert({
                workspace_id: workspaceId,
                name: teamDef.name,
                description: teamDef.description,
                mode: teamDef.mode,
                config,
            })
            .select()
            .single()

        if (teamResult.error) throw teamResult.error
        teamId = (teamResult.data as { id: string }).id

        // Add team members
        for (let i = 0; i < teamDef.steps.length; i++) {
            const step = teamDef.steps[i]
            const agent = createdAgents[step.agent_index] as Agent | undefined
            if (!agent) continue

            await supabase
                .from('team_members')
                .insert({
                    team_id: teamId,
                    agent_id: agent.id,
                    role: 'member',
                    position: i,
                })
        }
    }

    // 5. Create trigger (if defined)
    let triggerId: string | null = null
    if (resolved.trigger) {
        const trigDef = resolved.trigger
        const targetId = teamId ?? createdAgents[0]?.id

        if (targetId) {
            const triggerData = {
                workspace_id: workspaceId,
                ...(teamId
                    ? { team_id: teamId, agent_id: null }
                    : { agent_id: targetId, team_id: null }),
                trigger_type: trigDef.type,
                cron_expression: trigDef.type === 'cron' ? trigDef.cron_expression : null,
                webhook_token: trigDef.type === 'webhook' ? crypto.randomUUID() : null,
                task_title_template: trigDef.task_title_template,
                task_description_template: trigDef.task_description_template || '',
                context_options: [],
                enabled: true,
            }

            const trigResult = await supabase
                .from('agent_triggers')
                .insert(triggerData)
                .select()
                .single()

            if (trigResult.error) throw trigResult.error
            triggerId = (trigResult.data as { id: string }).id
        }
    }

    // 6. Increment install count (fire-and-forget)
    void supabase
        .from('workflow_templates')
        .update({ install_count: template.install_count + 1 })
        .eq('id', templateId)

    return {
        agents: createdAgents,
        teamId,
        triggerId,
    }
}
