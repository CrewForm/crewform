// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import type { OutputTemplate, OutputTemplateType } from '@/types'

/**
 * Supabase data access layer for output templates.
 * CRUD + assignment to agents.
 */

/** Fetch all output templates for a workspace (including built-in) */
export async function fetchOutputTemplates(workspaceId: string): Promise<OutputTemplate[]> {
    const result = await supabase
        .from('output_templates')
        .select('*')
        .or(`workspace_id.eq.${workspaceId},is_builtin.eq.true`)
        .order('is_builtin', { ascending: false })
        .order('name', { ascending: true })

    if (result.error) throw result.error
    return result.data as OutputTemplate[]
}

/** Fetch a single output template by ID */
export async function fetchOutputTemplate(id: string): Promise<OutputTemplate | null> {
    const result = await supabase
        .from('output_templates')
        .select('*')
        .eq('id', id)
        .single()

    if (result.error) {
        if (result.error.code === 'PGRST116') return null
        throw result.error
    }
    return result.data as OutputTemplate
}

/** Create a new output template */
export interface CreateOutputTemplateInput {
    workspace_id: string
    name: string
    template_type: OutputTemplateType
    body: string
    variables?: Record<string, unknown>[]
    is_builtin?: boolean
}

export async function createOutputTemplate(input: CreateOutputTemplateInput): Promise<OutputTemplate> {
    const result = await supabase
        .from('output_templates')
        .insert(input)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as OutputTemplate
}

/** Update an existing output template */
export type UpdateOutputTemplateInput = Partial<Omit<CreateOutputTemplateInput, 'workspace_id'>>

export async function updateOutputTemplate(id: string, input: UpdateOutputTemplateInput): Promise<OutputTemplate> {
    const result = await supabase
        .from('output_templates')
        .update(input)
        .eq('id', id)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as OutputTemplate
}

/** Delete an output template (agents with this template get output_template_id set to null via FK cascade) */
export async function deleteOutputTemplate(id: string): Promise<void> {
    const result = await supabase
        .from('output_templates')
        .delete()
        .eq('id', id)

    if (result.error) throw result.error
}

/** Assign an output template to an agent */
export async function assignOutputTemplateToAgent(agentId: string, templateId: string | null): Promise<void> {
    const result = await supabase
        .from('agents')
        .update({ output_template_id: templateId })
        .eq('id', agentId)

    if (result.error) throw result.error
}

/**
 * Render an output template with provided variables.
 * Replaces {{variable}} placeholders with values.
 * Returns the rendered string and a list of any missing variables.
 */
export function renderTemplate(
    templateBody: string,
    variables: Record<string, string>,
): { rendered: string; missingVariables: string[] } {
    const missingVariables: string[] = []

    const rendered = templateBody.replace(/\{\{(\w+)\}\}/g, (_match, varName: string) => {
        if (varName in variables) {
            return variables[varName]
        }
        missingVariables.push(varName)
        return `{{${varName}}}`
    })

    return { rendered, missingVariables }
}
