// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { copyInputAttachments } from '@/db/attachments'
import { supabase } from '@/lib/supabase'
import type { TeamRun, TeamMessage, TeamHandoff } from '@/types'

/**
 * Supabase data access layer for team runs, messages, and handoffs.
 */

// ─── Team Runs ───────────────────────────────────────────────────────────────

/** Fetch all runs for a team */
export async function fetchTeamRuns(teamId: string): Promise<TeamRun[]> {
    const result = await supabase
        .from('team_runs')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })

    if (result.error) throw result.error
    return result.data as TeamRun[]
}

/** Fetch a single team run by ID */
export async function fetchTeamRun(runId: string): Promise<TeamRun> {
    const result = await supabase
        .from('team_runs')
        .select('*')
        .eq('id', runId)
        .single()

    if (result.error) throw result.error
    return result.data as TeamRun
}

/** Create a new team run */
export interface CreateTeamRunInput {
    team_id: string
    workspace_id: string
    input_task: string
    created_by: string
    status?: 'pending' | 'draft'
}

export async function createTeamRun(input: CreateTeamRunInput): Promise<TeamRun> {
    const result = await supabase
        .from('team_runs')
        .insert({
            ...input,
            status: input.status ?? 'pending',
        })
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as TeamRun
}

/** Re-run as a new workflow so prior decisions, usage and effects remain recorded. */
export async function rerunTeamRun(id: string): Promise<TeamRun> {
    const original=await supabase.from('team_runs').select('*').eq('id',id).single()
    if(original.error) throw original.error
    const run=original.data as TeamRun
    const auth=await supabase.auth.getUser()
    if(!auth.data.user) throw new Error('Sign in to create a new run')
    const created=await createTeamRun({team_id:run.team_id,workspace_id:run.workspace_id,input_task:run.input_task,created_by:auth.data.user.id,status:'draft'})
    await copyInputAttachments(run.workspace_id,run.id,created.id,'team',auth.data.user.id)
    const dispatched=await supabase.from('team_runs').update({status:'pending'}).eq('id',created.id).select().single()
    if(dispatched.error) throw dispatched.error
    return dispatched.data as TeamRun
}

// ─── Team Messages ───────────────────────────────────────────────────────────

/** Fetch messages for a run, ordered chronologically */
export async function fetchTeamMessages(runId: string): Promise<TeamMessage[]> {
    const result = await supabase
        .from('team_messages')
        .select('*')
        .eq('run_id', runId)
        .order('created_at', { ascending: true })

    if (result.error) throw result.error
    return result.data as TeamMessage[]
}

// ─── Team Handoffs ───────────────────────────────────────────────────────────

/** Fetch handoffs for a run, ordered chronologically */
export async function fetchTeamHandoffs(runId: string): Promise<TeamHandoff[]> {
    const result = await supabase
        .from('team_handoffs')
        .select('*')
        .eq('run_id', runId)
        .order('created_at', { ascending: true })

    if (result.error) throw result.error
    return result.data as TeamHandoff[]
}
