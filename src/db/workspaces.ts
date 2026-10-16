// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import type { Workspace } from '@/types'

/**
 * Supabase data access layer for workspaces.
 * All workspace queries go through this module (per Ticket 2.5 db.* pattern).
 */

/** Fetch all workspaces for the current user */
export async function fetchWorkspaces(): Promise<Workspace[]> {
    const result = await supabase
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: false })

    if (result.error) throw result.error
    return result.data as Workspace[]
}

/** Fetch a single workspace by ID */
export async function fetchWorkspaceById(id: string): Promise<Workspace> {
    const result = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', id)
        .single()

    if (result.error) throw result.error
    return result.data as Workspace
}

/** Fetch the primary workspace for a user (MVP: one per user) */
export async function fetchWorkspaceByOwner(userId: string): Promise<Workspace | null> {
    const result = await supabase
        .from('workspaces')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

    if (result.error) {
        if (result.error.code === 'PGRST116') return null
        throw result.error
    }

    return result.data as Workspace
}

/** Create a new workspace */
export async function createWorkspace(
    input: Pick<Workspace, 'name' | 'slug'>,
): Promise<Workspace> {
    const authResult = await supabase.auth.getUser()
    const user = authResult.data.user
    if (!user) throw new Error('Not authenticated')

    const result = await supabase
        .from('workspaces')
        .insert({
            name: input.name,
            slug: input.slug,
            owner_id: user.id,
        })
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as Workspace
}

/** Update an existing workspace */
export async function updateWorkspace(
    id: string,
    updates: Partial<Pick<Workspace, 'name' | 'slug'>>,
): Promise<Workspace> {
    const result = await supabase
        .from('workspaces')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as Workspace
}
