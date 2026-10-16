// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import type { CustomTool } from '@/types'

/**
 * Supabase data access layer for custom tools.
 */

/** Fetch all custom tools for a workspace */
export async function fetchCustomTools(workspaceId: string): Promise<CustomTool[]> {
    const result = await supabase
        .from('custom_tools')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })

    if (result.error) throw result.error
    return result.data as CustomTool[]
}

/** Create a new custom tool */
export interface CreateCustomToolInput {
    workspace_id: string
    name: string
    description: string
    parameters: {
        properties: Record<string, { type: string; description: string }>
        required: string[]
    }
    webhook_url: string
    webhook_headers: Record<string, string>
}

export async function createCustomTool(input: CreateCustomToolInput): Promise<CustomTool> {
    const result = await supabase
        .from('custom_tools')
        .insert(input)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as CustomTool
}

/** Update an existing custom tool */
export type UpdateCustomToolInput = Partial<Omit<CreateCustomToolInput, 'workspace_id'>>

export async function updateCustomTool(id: string, input: UpdateCustomToolInput): Promise<CustomTool> {
    const result = await supabase
        .from('custom_tools')
        .update(input)
        .eq('id', id)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as CustomTool
}

/** Delete a custom tool */
export async function deleteCustomTool(id: string): Promise<void> {
    const result = await supabase
        .from('custom_tools')
        .delete()
        .eq('id', id)

    if (result.error) throw result.error
}
