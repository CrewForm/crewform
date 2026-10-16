// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import type { Task, TeamRun } from '@/types'

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

export interface DashboardStats {
    tasksThisMonth: number
    tasksRunning: number
    tasksCompleted: number
    tasksFailed: number
    teamRunsThisMonth: number
    teamRunsRunning: number
    teamRunsCompleted: number
    teamRunsFailed: number
    estimatedCostUsd: number
}

/** Fetch aggregate stats for the dashboard */
export async function fetchDashboardStats(workspaceId: string): Promise<DashboardStats> {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const monthStart = startOfMonth.toISOString()

    // Fetch tasks, team runs (status + cost), and agent task cost in parallel
    const [taskResult, runResult, costResult] = await Promise.all([
        supabase
            .from('tasks')
            .select('status')
            .eq('workspace_id', workspaceId)
            .gte('created_at', monthStart),
        supabase
            .from('team_runs')
            .select('status, cost_estimate_usd')
            .eq('workspace_id', workspaceId)
            .gte('created_at', monthStart),
        supabase
            .from('agent_tasks')
            .select('cost_estimate_usd')
            .eq('workspace_id', workspaceId)
            .gte('created_at', monthStart),
    ])

    if (taskResult.error) throw taskResult.error
    if (runResult.error) throw runResult.error
    if (costResult.error) throw costResult.error

    const taskList = taskResult.data as Array<{ status: string }>
    const runList = runResult.data as Array<{ status: string; cost_estimate_usd: number }>

    const taskCost = costResult.data.reduce(
        (sum, row) => sum + (row as { cost_estimate_usd: number }).cost_estimate_usd,
        0,
    )
    const runCost = runList.reduce((sum, row) => sum + row.cost_estimate_usd, 0)
    const totalCost = taskCost + runCost

    return {
        tasksThisMonth: taskList.length,
        tasksRunning: taskList.filter((t) => t.status === 'running').length,
        tasksCompleted: taskList.filter((t) => t.status === 'completed').length,
        tasksFailed: taskList.filter((t) => t.status === 'failed').length,
        teamRunsThisMonth: runList.length,
        teamRunsRunning: runList.filter((r) => r.status === 'running').length,
        teamRunsCompleted: runList.filter((r) => r.status === 'completed').length,
        teamRunsFailed: runList.filter((r) => r.status === 'failed').length,
        estimatedCostUsd: totalCost,
    }
}

// ─── Agent Performance ───────────────────────────────────────────────────────

export interface AgentPerformanceRow {
    agentId: string
    agentName: string
    completedCount: number
    failedCount: number
    totalTokens: number
    totalCost: number
}

/** Fetch per-agent performance stats */
export async function fetchAgentPerformance(workspaceId: string): Promise<AgentPerformanceRow[]> {
    // Fetch all agent_tasks with agent info
    const { data, error } = await supabase
        .from('agent_tasks')
        .select('agent_id, status, tokens_used, cost_estimate_usd')
        .eq('workspace_id', workspaceId)

    if (error) throw error

    // Fetch agents for names
    const { data: agents, error: agentError } = await supabase
        .from('agents')
        .select('id, name')
        .eq('workspace_id', workspaceId)

    if (agentError) throw agentError

    const agentMap = new Map<string, string>()
    for (const a of agents as Array<{ id: string; name: string }>) {
        agentMap.set(a.id, a.name)
    }

    // Aggregate by agent
    const perfMap = new Map<string, AgentPerformanceRow>()

    for (const row of data as Array<{ agent_id: string; status: string; tokens_used: number; cost_estimate_usd: number }>) {
        let entry = perfMap.get(row.agent_id)
        if (!entry) {
            entry = {
                agentId: row.agent_id,
                agentName: agentMap.get(row.agent_id) ?? 'Unknown',
                completedCount: 0,
                failedCount: 0,
                totalTokens: 0,
                totalCost: 0,
            }
            perfMap.set(row.agent_id, entry)
        }

        if (row.status === 'completed') entry.completedCount++
        if (row.status === 'failed') entry.failedCount++
        entry.totalTokens += row.tokens_used
        entry.totalCost += row.cost_estimate_usd
    }

    return Array.from(perfMap.values()).sort((a, b) => b.completedCount - a.completedCount)
}

// ─── Team Performance ────────────────────────────────────────────────────────

export interface TeamPerformanceRow {
    teamId: string
    teamName: string
    mode: string
    completedCount: number
    failedCount: number
    totalTokens: number
    totalCost: number
}

/** Fetch per-team performance stats */
export async function fetchTeamPerformance(workspaceId: string): Promise<TeamPerformanceRow[]> {
    const [runResult, teamResult] = await Promise.all([
        supabase
            .from('team_runs')
            .select('team_id, status, tokens_total, cost_estimate_usd')
            .eq('workspace_id', workspaceId),
        supabase
            .from('teams')
            .select('id, name, mode')
            .eq('workspace_id', workspaceId),
    ])

    if (runResult.error) throw runResult.error
    if (teamResult.error) throw teamResult.error

    const teamMap = new Map<string, { name: string; mode: string }>()
    for (const t of teamResult.data as Array<{ id: string; name: string; mode: string }>) {
        teamMap.set(t.id, { name: t.name, mode: t.mode })
    }

    const perfMap = new Map<string, TeamPerformanceRow>()

    for (const row of runResult.data as Array<{ team_id: string; status: string; tokens_total: number; cost_estimate_usd: number }>) {
        let entry = perfMap.get(row.team_id)
        if (!entry) {
            const team = teamMap.get(row.team_id)
            entry = {
                teamId: row.team_id,
                teamName: team?.name ?? 'Unknown',
                mode: team?.mode ?? 'pipeline',
                completedCount: 0,
                failedCount: 0,
                totalTokens: 0,
                totalCost: 0,
            }
            perfMap.set(row.team_id, entry)
        }

        if (row.status === 'completed') entry.completedCount++
        if (row.status === 'failed') entry.failedCount++
        entry.totalTokens += row.tokens_total
        entry.totalCost += row.cost_estimate_usd
    }

    return Array.from(perfMap.values()).sort((a, b) => b.completedCount - a.completedCount)
}

// ─── Recent Activity ─────────────────────────────────────────────────────────

export type ActivityItem =
    | { type: 'task'; data: Task }
    | { type: 'team_run'; data: TeamRun }

/** Fetch recent activity — last 15 tasks + last 10 team runs, merged by date */
export async function fetchRecentActivity(workspaceId: string): Promise<ActivityItem[]> {
    const [taskResult, runResult] = await Promise.all([
        supabase
            .from('tasks')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('updated_at', { ascending: false })
            .limit(15),
        supabase
            .from('team_runs')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('updated_at', { ascending: false })
            .limit(10),
    ])

    if (taskResult.error) throw taskResult.error
    if (runResult.error) throw runResult.error

    const items: ActivityItem[] = [
        ...(taskResult.data as Task[]).map((t) => ({ type: 'task' as const, data: t })),
        ...(runResult.data as TeamRun[]).map((r) => ({ type: 'team_run' as const, data: r })),
    ]

    // Sort merged list by updated_at desc
    items.sort((a, b) => {
        const aTime = new Date(a.data.updated_at).getTime()
        const bTime = new Date(b.data.updated_at).getTime()
        return bTime - aTime
    })

    return items.slice(0, 20)
}
