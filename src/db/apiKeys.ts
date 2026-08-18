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
    const result = await supabase.functions.invoke('api-key-manager', {
        body: { action: 'list', workspace_id: workspaceId },
    })

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
    const result = await supabase.functions.invoke('api-key-manager', {
        body: {
            action: 'save',
            workspace_id: input.workspace_id,
            provider: input.provider,
            raw_key: input.encrypted_key,
            is_active: true,
            base_url: input.base_url,
        },
    })

    if (result.error) throw result.error
    return result.data as ApiKey
}

/** Toggle is_active flag on an API key */
export async function toggleProviderActive(workspaceId: string, id: string, isActive: boolean): Promise<ApiKey> {
    const result = await supabase.functions.invoke('api-key-manager', {
        body: { action: 'toggle', workspace_id: workspaceId, id, is_active: isActive },
    })

    if (result.error) throw result.error
    return result.data as ApiKey
}

/** Delete an API key */
export async function deleteApiKey(workspaceId: string, id: string): Promise<void> {
    const result = await supabase.functions.invoke('api-key-manager', {
        body: { action: 'delete', workspace_id: workspaceId, id },
    })

    if (result.error) throw result.error
}
