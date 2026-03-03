// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'

export interface TeamMemoryEntry {
    id: string
    team_id: string
    run_id: string | null
    content: string
    metadata: Record<string, unknown>
    created_at: string
}

/** Fetch all memory entries for a team, newest first */
export async function fetchTeamMemories(teamId: string): Promise<TeamMemoryEntry[]> {
    const result = await supabase
        .from('team_memory')
        .select('id, team_id, run_id, content, metadata, created_at')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })

    if (result.error) throw result.error
    return result.data as TeamMemoryEntry[]
}

/** Delete a single memory entry */
export async function deleteTeamMemory(memoryId: string): Promise<void> {
    const result = await supabase
        .from('team_memory')
        .delete()
        .eq('id', memoryId)

    if (result.error) throw result.error
}
