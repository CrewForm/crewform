// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'

/**
 * Supabase data access layer for REST API keys.
 */

export interface RestApiKey {
    id: string
    workspace_id: string
    name: string
    key_hash: string
    key_prefix: string
    permissions: { read: boolean; write: boolean }
    last_used_at: string | null
    created_by: string | null
    created_at: string
    updated_at: string
}

/** Fetch all REST API keys for a workspace */
export async function fetchRestApiKeys(workspaceId: string): Promise<RestApiKey[]> {
    const { data, error } = await supabase
        .from('rest_api_keys')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })

    if (error) throw error
    return data as RestApiKey[]
}

/**
 * Generate a new REST API key.
 * Returns the raw key (only shown once) and the created record.
 */
export async function createRestApiKey(
    workspaceId: string,
    name: string,
    userId: string,
): Promise<{ rawKey: string; record: RestApiKey }> {
    // Generate a secure random key
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    const rawKey = 'cf_' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')

    // Hash the key (SHA-256)
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawKey))
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Store prefix for display
    const keyPrefix = rawKey.substring(0, 11) // "cf_abcd1234"

    const result: { data: unknown; error: { message: string } | null } = await supabase
        .from('rest_api_keys')
        .insert({
            workspace_id: workspaceId,
            name,
            key_hash: keyHash,
            key_prefix: keyPrefix,
            created_by: userId,
        })
        .select()
        .single()

    if (result.error) throw new Error(result.error.message)
    return { rawKey, record: result.data as RestApiKey }
}

/** Delete a REST API key */
export async function deleteRestApiKey(id: string): Promise<void> {
    const { error } = await supabase
        .from('rest_api_keys')
        .delete()
        .eq('id', id)

    if (error) throw error
}
