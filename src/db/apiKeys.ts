// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import type { ApiKey } from '@/types'

/**
 * Supabase data access layer for API keys.
 * Keys are stored encrypted (Edge Function handles encryption).
 * Frontend only sees key_hint (last 4 chars) for display.
 */

/** Fetch all API keys for a workspace */
export async function fetchApiKeys(workspaceId: string): Promise<ApiKey[]> {
    const result = await supabase
        .from('api_keys')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('provider', { ascending: true })

    if (result.error) throw result.error
    return result.data as ApiKey[]
}

/** Upsert an API key (one per provider per workspace) */
export interface UpsertApiKeyInput {
    workspace_id: string
    provider: string
    encrypted_key: string
    key_hint: string
    is_valid: boolean
    base_url?: string | null
}

export async function upsertApiKey(input: UpsertApiKeyInput): Promise<ApiKey> {
    // Check if key already exists for this provider
    const existing = await supabase
        .from('api_keys')
        .select('id')
        .eq('workspace_id', input.workspace_id)
        .eq('provider', input.provider)
        .maybeSingle()

    if (existing.error) throw existing.error

    if (existing.data) {
        // Update existing
        const result = await supabase
            .from('api_keys')
            .update({
                encrypted_key: input.encrypted_key,
                key_hint: input.key_hint,
                is_valid: input.is_valid,
                ...(input.base_url !== undefined ? { base_url: input.base_url } : {}),
            })
            .eq('id', existing.data.id)
            .select()
            .single()

        if (result.error) throw result.error
        return result.data as ApiKey
    }

    // Insert new
    const result = await supabase
        .from('api_keys')
        .insert(input)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as ApiKey
}

/** Toggle is_active flag on an API key */
export async function toggleProviderActive(id: string, isActive: boolean): Promise<ApiKey> {
    const result = await supabase
        .from('api_keys')
        .update({ is_active: isActive })
        .eq('id', id)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as ApiKey
}

/** Delete an API key */
export async function deleteApiKey(id: string): Promise<void> {
    const result = await supabase
        .from('api_keys')
        .delete()
        .eq('id', id)

    if (result.error) throw result.error
}
