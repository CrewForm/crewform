// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import { enforceQuota } from '@/lib/enforceQuota'
import type { Task, TaskStatus, TaskPriority } from '@/types'

/**
 * Supabase data access layer for tasks.
 */

export interface TaskFilters {
    status?: TaskStatus[]
    priority?: TaskPriority[]
    agentId?: string
    search?: string
    dateFrom?: string
    dateTo?: string
}

/** Fetch tasks for a workspace with optional filters */
export async function fetchTasks(
    workspaceId: string,
    filters?: TaskFilters,
): Promise<Task[]> {
    let query = supabase
        .from('tasks')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })

    if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status)
    }
    if (filters?.priority && filters.priority.length > 0) {
        query = query.in('priority', filters.priority)
    }
    if (filters?.agentId) {
        query = query.eq('assigned_agent_id', filters.agentId)
    }
    if (filters?.search) {
        query = query.or(
            `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`,
        )
    }
    if (filters?.dateFrom) {
        query = query.gte('scheduled_for', filters.dateFrom)
    }
    if (filters?.dateTo) {
        query = query.lte('scheduled_for', filters.dateTo)
    }

    const result = await query
    if (result.error) throw result.error
    return result.data as Task[]
}

/** Create a new task */
export interface CreateTaskInput {
    workspace_id: string
    title: string
    description: string
    assigned_agent_id: string
    priority: TaskPriority
    status: TaskStatus
    created_by: string
    scheduled_for?: string | null
    metadata?: Record<string, unknown>
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
    await enforceQuota(input.workspace_id, 'tasks_per_month')

    const result = await supabase
        .from('tasks')
        .insert(input)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as Task
}

/** Update the status of a task (e.g. cancel) */
export async function updateTaskStatus(
    id: string,
    status: TaskStatus,
): Promise<Task> {
    const result = await supabase
        .from('tasks')
        .update({ status })
        .eq('id', id)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as Task
}

/** Re-run a task: reset to dispatched, clear previous results */
export async function rerunTask(id: string): Promise<Task> {
    const result = await supabase
        .from('tasks')
        .update({
            status: 'dispatched' as TaskStatus,
            result: null,
            error: null,
            metadata: {},
            claimed_by_runner: null,
            scheduled_for: null,
        })
        .eq('id', id)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as Task
}

/** Update the scheduled date of a task */
export async function updateTaskSchedule(
    id: string,
    scheduledFor: string | null,
): Promise<Task> {
    const result = await supabase
        .from('tasks')
        .update({ scheduled_for: scheduledFor })
        .eq('id', id)
        .select()
        .single()

    if (result.error) throw result.error
    return result.data as Task
}

/** Delete a task */
export async function deleteTask(id: string): Promise<void> {
    const result = await supabase
        .from('tasks')
        .delete()
        .eq('id', id)

    if (result.error) throw result.error
}
