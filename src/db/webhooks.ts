// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'

/**
 * Supabase data access layer for webhooks / output routes.
 */

export interface OutputRoute {
    id: string
    workspace_id: string
    name: string
    destination_type: 'http' | 'slack' | 'discord' | 'telegram' | 'teams' | 'asana' | 'trello'
    config: Record<string, unknown>
    events: string[]
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface WebhookLog {
    id: string
    route_id: string
    task_id: string
    event: string
    status: 'success' | 'failed'
    status_code: number | null
    error: string | null
    payload: Record<string, unknown> | null
    created_at: string
}

export interface CreateRouteInput {
    workspace_id: string
    name: string
    destination_type: 'http' | 'slack' | 'discord' | 'telegram' | 'teams' | 'asana' | 'trello'
    config: Record<string, unknown>
    events: string[]
    is_active?: boolean
}

export type UpdateRouteInput = Partial<Omit<CreateRouteInput, 'workspace_id'>>

/** Fetch all output routes for a workspace */
export async function fetchRoutes(workspaceId: string): Promise<OutputRoute[]> {
    const result = await supabase
        .from('output_routes')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })

    if (result.error) throw result.error
    return result.data as OutputRoute[]
}

/** Create a new output route */
export async function createRoute(input: CreateRouteInput): Promise<OutputRoute> {
    const result = await supabase
        .from('output_routes')
        .insert(input)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as OutputRoute
}

/** Update an existing output route */
export async function updateRoute(id: string, input: UpdateRouteInput): Promise<OutputRoute> {
    const result = await supabase
        .from('output_routes')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as OutputRoute
}

/** Delete an output route */
export async function deleteRoute(id: string): Promise<void> {
    const result = await supabase
        .from('output_routes')
        .delete()
        .eq('id', id)

    if (result.error) throw result.error
}

/** Fetch webhook logs for a route */
export async function fetchWebhookLogs(routeId: string, limit = 20): Promise<WebhookLog[]> {
    const result = await supabase
        .from('webhook_logs')
        .select('*')
        .eq('route_id', routeId)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (result.error) throw result.error
    return result.data as WebhookLog[]
}

/** Send a test payload to verify a webhook route is working */
export async function testRoute(routeId: string): Promise<{ ok: boolean; status_code?: number; error?: string }> {
    const response: { data: unknown; error: { message: string } | null } = await supabase.functions.invoke('webhook-test', {
        body: { route_id: routeId },
    })

    if (response.error) {
        return { ok: false, error: response.error.message }
    }

    const result = response.data as { ok: boolean; status_code?: number; error?: string } | null
    return result ?? { ok: false, error: 'Empty response' }
}
