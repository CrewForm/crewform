// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GoogleConnection {
    id: string
    workspace_id: string
    google_email: string | null
    scopes: string[]
    token_expiry: string
    created_at: string
    updated_at: string
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function fetchGoogleConnection(workspaceId: string): Promise<GoogleConnection | null> {
    const { data, error } = await supabase
        .from('google_connections')
        .select('id, workspace_id, google_email, scopes, token_expiry, created_at, updated_at')
        .eq('workspace_id', workspaceId)
        .maybeSingle()

    if (error) throw new Error(error.message)
    return data as GoogleConnection | null
}

export async function deleteGoogleConnection(workspaceId: string): Promise<void> {
    const { error } = await supabase
        .from('google_connections')
        .delete()
        .eq('workspace_id', workspaceId)

    if (error) throw new Error(error.message)
}

export async function initiateGoogleOAuth(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-oauth-start`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
        },
    )

    if (!resp.ok) {
        const err = await resp.text()
        throw new Error(`OAuth start failed: ${err}`)
    }

    const result = await resp.json() as { auth_url: string }
    return result.auth_url
}
