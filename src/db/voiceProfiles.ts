// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import type { VoiceProfile, VoiceProfileTone } from '@/types'

/**
 * Supabase data access layer for voice profiles.
 * CRUD + assignment to agents.
 */

/** Fetch all voice profiles for a workspace */
export async function fetchVoiceProfiles(workspaceId: string): Promise<VoiceProfile[]> {
    const result = await supabase
        .from('voice_profiles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })

    if (result.error) throw result.error
    return result.data as VoiceProfile[]
}

/** Fetch only template voice profiles (shared brand voices) */
export async function fetchVoiceTemplates(workspaceId: string): Promise<VoiceProfile[]> {
    const result = await supabase
        .from('voice_profiles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_template', true)
        .order('name', { ascending: true })

    if (result.error) throw result.error
    return result.data as VoiceProfile[]
}

/** Fetch a single voice profile by ID */
export async function fetchVoiceProfile(id: string): Promise<VoiceProfile | null> {
    const result = await supabase
        .from('voice_profiles')
        .select('*')
        .eq('id', id)
        .single()

    if (result.error) {
        if (result.error.code === 'PGRST116') return null
        throw result.error
    }
    return result.data as VoiceProfile
}

/** Create a new voice profile */
export interface CreateVoiceProfileInput {
    workspace_id: string
    name: string
    tone: VoiceProfileTone
    custom_instructions?: string | null
    output_format_hints?: string | null
    is_template?: boolean
}

export async function createVoiceProfile(input: CreateVoiceProfileInput): Promise<VoiceProfile> {
    const result = await supabase
        .from('voice_profiles')
        .insert(input)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as VoiceProfile
}

/** Update an existing voice profile */
export type UpdateVoiceProfileInput = Partial<Omit<CreateVoiceProfileInput, 'workspace_id'>>

export async function updateVoiceProfile(id: string, input: UpdateVoiceProfileInput): Promise<VoiceProfile> {
    const result = await supabase
        .from('voice_profiles')
        .update(input)
        .eq('id', id)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as VoiceProfile
}

/** Delete a voice profile (agents with this profile get voice_profile_id set to null via FK cascade) */
export async function deleteVoiceProfile(id: string): Promise<void> {
    const result = await supabase
        .from('voice_profiles')
        .delete()
        .eq('id', id)

    if (result.error) throw result.error
}

/** Assign a voice profile to an agent */
export async function assignVoiceProfileToAgent(agentId: string, profileId: string | null): Promise<void> {
    const result = await supabase
        .from('agents')
        .update({ voice_profile_id: profileId })
        .eq('id', agentId)

    if (result.error) throw result.error
}
