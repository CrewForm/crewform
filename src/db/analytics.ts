// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'

// ─── Completion Over Time ────────────────────────────────────────────────────

export interface DailyCompletion {
    date: string       // 'YYYY-MM-DD'
    completed: number
    failed: number
    total: number
}

/** Fetch daily task + team run completion counts between start and end dates */
export async function fetchCompletionOverTime(
    workspaceId: string,
    startDate: string,
    endDate: string,
): Promise<DailyCompletion[]> {
    const [taskResult, teamResult] = await Promise.all([
        supabase
            .from('agent_tasks')
            .select('status, completed_at')
            .eq('workspace_id', workspaceId)
            .gte('completed_at', startDate)
            .lte('completed_at', endDate)
            .in('status', ['completed', 'failed']),
        supabase
            .from('team_runs')
            .select('status, completed_at')
            .eq('workspace_id', workspaceId)
            .gte('completed_at', startDate)
            .lte('completed_at', endDate)
            .in('status', ['completed', 'failed']),
    ])

    if (taskResult.error) throw taskResult.error
    if (teamResult.error) throw teamResult.error

    // Merge both sources
    const allRows = [
        ...(taskResult.data as Array<{ status: string; completed_at: string }>),
        ...(teamResult.data as Array<{ status: string; completed_at: string }>),
    ]

    // Group by day
    const dayMap = new Map<string, DailyCompletion>()

    for (const row of allRows) {
        if (!row.completed_at) continue
        const day = row.completed_at.slice(0, 10) // 'YYYY-MM-DD'

        let entry = dayMap.get(day)
        if (!entry) {
            entry = { date: day, completed: 0, failed: 0, total: 0 }
            dayMap.set(day, entry)
        }

        entry.total++
        if (row.status === 'completed') entry.completed++
        if (row.status === 'failed') entry.failed++
    }

    // Fill in missing days with zeros
    const result: DailyCompletion[] = []
    const current = new Date(startDate)
    const end = new Date(endDate)

    while (current <= end) {
        const dayStr = current.toISOString().slice(0, 10)
        result.push(dayMap.get(dayStr) ?? { date: dayStr, completed: 0, failed: 0, total: 0 })
        current.setDate(current.getDate() + 1)
    }

    return result
}

// ─── Cost By Agent ───────────────────────────────────────────────────────────

export interface AgentCost {
    agentName: string
    cost: number
}

/** Fetch total cost per agent in the date range (tasks + team runs via usage_records) */
export async function fetchCostByAgent(
    workspaceId: string,
    startDate: string,
    endDate: string,
): Promise<AgentCost[]> {
    const [taskResult, usageResult, agentResult] = await Promise.all([
        supabase
            .from('agent_tasks')
            .select('agent_id, cost_estimate_usd')
            .eq('workspace_id', workspaceId)
            .gte('created_at', startDate)
            .lte('created_at', endDate),
        supabase
            .from('usage_records')
            .select('agent_id, cost_usd')
            .eq('workspace_id', workspaceId)
            .eq('event_type', 'team_run')
            .gte('recorded_at', startDate)
            .lte('recorded_at', endDate)
            .not('agent_id', 'is', null),
        supabase
            .from('agents')
            .select('id, name')
            .eq('workspace_id', workspaceId),
    ])

    if (taskResult.error) throw taskResult.error
    if (usageResult.error) throw usageResult.error
    if (agentResult.error) throw agentResult.error

    const agentMap = new Map<string, string>()
    for (const a of agentResult.data as Array<{ id: string; name: string }>) {
        agentMap.set(a.id, a.name)
    }

    const costMap = new Map<string, number>()

    // Task costs
    for (const row of taskResult.data as Array<{ agent_id: string; cost_estimate_usd: number }>) {
        const prev = costMap.get(row.agent_id) ?? 0
        costMap.set(row.agent_id, prev + row.cost_estimate_usd)
    }

    // Team run costs (from usage_records)
    for (const row of usageResult.data as Array<{ agent_id: string; cost_usd: number }>) {
        if (!row.agent_id) continue
        const prev = costMap.get(row.agent_id) ?? 0
        costMap.set(row.agent_id, prev + row.cost_usd)
    }

    return Array.from(costMap.entries())
        .map(([agentId, cost]) => ({
            agentName: agentMap.get(agentId) ?? 'Unknown',
            cost,
        }))
        .sort((a, b) => b.cost - a.cost)
}

// ─── Status Distribution ─────────────────────────────────────────────────────

export interface StatusCount {
    status: string
    count: number
    color: string
}

const STATUS_COLORS: Record<string, string> = {
    completed: '#22c55e',
    failed: '#ef4444',
    running: '#3b82f6',
    pending: '#6b7280',
    dispatched: '#06b6d4',
    cancelled: '#64748b',
    paused: '#eab308',
}

/** Fetch task + team run count per status in the date range */
export async function fetchStatusDistribution(
    workspaceId: string,
    startDate: string,
    endDate: string,
): Promise<StatusCount[]> {
    const [taskResult, teamResult] = await Promise.all([
        supabase
            .from('tasks')
            .select('status')
            .eq('workspace_id', workspaceId)
            .gte('created_at', startDate)
            .lte('created_at', endDate),
        supabase
            .from('team_runs')
            .select('status')
            .eq('workspace_id', workspaceId)
            .gte('created_at', startDate)
            .lte('created_at', endDate),
    ])

    if (taskResult.error) throw taskResult.error
    if (teamResult.error) throw teamResult.error

    const allRows = [
        ...(taskResult.data as Array<{ status: string }>),
        ...(teamResult.data as Array<{ status: string }>),
    ]

    const countMap = new Map<string, number>()
    for (const row of allRows) {
        countMap.set(row.status, (countMap.get(row.status) ?? 0) + 1)
    }

    return Array.from(countMap.entries())
        .map(([status, count]) => ({
            status: status.charAt(0).toUpperCase() + status.slice(1),
            count,
            color: STATUS_COLORS[status] ?? '#6b7280',
        }))
        .sort((a, b) => b.count - a.count)
}

// ─── Top Models By Usage ─────────────────────────────────────────────────────

export interface ModelUsage {
    model: string
    count: number
    tokens: number
}

/** Fetch usage count per model in the date range (tasks + team run usage_records) */
export async function fetchTopModels(
    workspaceId: string,
    startDate: string,
    endDate: string,
): Promise<ModelUsage[]> {
    const [taskResult, usageResult] = await Promise.all([
        supabase
            .from('agent_tasks')
            .select('model_used, tokens_used')
            .eq('workspace_id', workspaceId)
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .not('model_used', 'is', null),
        supabase
            .from('usage_records')
            .select('tokens_used, metadata')
            .eq('workspace_id', workspaceId)
            .eq('event_type', 'team_run')
            .gte('recorded_at', startDate)
            .lte('recorded_at', endDate),
    ])

    if (taskResult.error) throw taskResult.error
    if (usageResult.error) throw usageResult.error

    const modelMap = new Map<string, ModelUsage>()

    // From tasks
    for (const row of taskResult.data as Array<{ model_used: string; tokens_used: number }>) {
        if (!row.model_used) continue
        let entry = modelMap.get(row.model_used)
        if (!entry) {
            entry = { model: row.model_used, count: 0, tokens: 0 }
            modelMap.set(row.model_used, entry)
        }
        entry.count++
        entry.tokens += row.tokens_used
    }

    // From team run usage_records (model stored in metadata.model)
    for (const row of usageResult.data as Array<{ tokens_used: number; metadata: Record<string, unknown> }>) {
        const model = row.metadata.model as string | undefined
        if (!model) continue
        let entry = modelMap.get(model)
        if (!entry) {
            entry = { model, count: 0, tokens: 0 }
            modelMap.set(model, entry)
        }
        entry.count++
        entry.tokens += row.tokens_used
    }

    return Array.from(modelMap.values()).sort((a, b) => b.count - a.count).slice(0, 10)
}

// ─── Cost Over Time ──────────────────────────────────────────────────────────

export interface DailyCost {
    date: string       // 'YYYY-MM-DD'
    cost: number
    tokens: number
    cumulative: number
}

/** Fetch daily cost time-series between start and end dates (tasks + team runs) */
export async function fetchCostOverTime(
    workspaceId: string,
    startDate: string,
    endDate: string,
): Promise<DailyCost[]> {
    const [taskResult, teamResult] = await Promise.all([
        supabase
            .from('agent_tasks')
            .select('cost_estimate_usd, tokens_used, completed_at')
            .eq('workspace_id', workspaceId)
            .gte('completed_at', startDate)
            .lte('completed_at', endDate)
            .in('status', ['completed', 'failed']),
        supabase
            .from('team_runs')
            .select('cost_estimate_usd, tokens_total, completed_at')
            .eq('workspace_id', workspaceId)
            .gte('completed_at', startDate)
            .lte('completed_at', endDate)
            .in('status', ['completed', 'failed']),
    ])

    if (taskResult.error) throw taskResult.error
    if (teamResult.error) throw teamResult.error

    // Group by day
    const dayMap = new Map<string, { cost: number; tokens: number }>()

    for (const row of taskResult.data as Array<{ cost_estimate_usd: number | null; tokens_used: number | null; completed_at: string }>) {
        if (!row.completed_at) continue
        const day = row.completed_at.slice(0, 10)
        const entry = dayMap.get(day) ?? { cost: 0, tokens: 0 }
        entry.cost += row.cost_estimate_usd ?? 0
        entry.tokens += row.tokens_used ?? 0
        dayMap.set(day, entry)
    }

    for (const row of teamResult.data as Array<{ cost_estimate_usd: number | null; tokens_total: number | null; completed_at: string }>) {
        if (!row.completed_at) continue
        const day = row.completed_at.slice(0, 10)
        const entry = dayMap.get(day) ?? { cost: 0, tokens: 0 }
        entry.cost += row.cost_estimate_usd ?? 0
        entry.tokens += row.tokens_total ?? 0
        dayMap.set(day, entry)
    }

    // Fill days + compute cumulative
    const result: DailyCost[] = []
    let cumulative = 0
    const current = new Date(startDate)
    const end = new Date(endDate)

    while (current <= end) {
        const dayStr = current.toISOString().slice(0, 10)
        const entry = dayMap.get(dayStr) ?? { cost: 0, tokens: 0 }
        cumulative += entry.cost
        result.push({ date: dayStr, cost: entry.cost, tokens: entry.tokens, cumulative })
        current.setDate(current.getDate() + 1)
    }

    return result
}

// ─── Time Saved ──────────────────────────────────────────────────────────────

export interface TimeSavedData {
    agentMinutes: number      // Total agent processing time
    manualEstimate: number    // Estimated manual equivalent (5× multiplier)
    timeSavedMinutes: number  // Delta
    taskCount: number
    avgSecondsPerTask: number
}

/** Estimate time saved by agents compared to manual work (tasks + team runs) */
export async function fetchTimeSaved(
    workspaceId: string,
    startDate: string,
    endDate: string,
): Promise<TimeSavedData> {
    const [taskResult, teamResult] = await Promise.all([
        supabase
            .from('agent_tasks')
            .select('started_at, completed_at')
            .eq('workspace_id', workspaceId)
            .eq('status', 'completed')
            .gte('completed_at', startDate)
            .lte('completed_at', endDate)
            .not('started_at', 'is', null)
            .not('completed_at', 'is', null),
        supabase
            .from('team_runs')
            .select('started_at, completed_at')
            .eq('workspace_id', workspaceId)
            .eq('status', 'completed')
            .gte('completed_at', startDate)
            .lte('completed_at', endDate)
            .not('started_at', 'is', null)
            .not('completed_at', 'is', null),
    ])

    if (taskResult.error) throw taskResult.error
    if (teamResult.error) throw teamResult.error

    const allRows = [
        ...(taskResult.data as Array<{ started_at: string; completed_at: string }>),
        ...(teamResult.data as Array<{ started_at: string; completed_at: string }>),
    ]

    let totalSeconds = 0
    let count = 0

    for (const row of allRows) {
        const start = new Date(row.started_at).getTime()
        const end = new Date(row.completed_at).getTime()
        const duration = (end - start) / 1000
        if (duration > 0 && duration < 3600) { // Cap at 1 hour to exclude outliers
            totalSeconds += duration
            count++
        }
    }

    const agentMinutes = totalSeconds / 60
    const avgSecondsPerTask = count > 0 ? totalSeconds / count : 0
    const manualEstimate = agentMinutes * 5 // 5× multiplier
    const timeSavedMinutes = manualEstimate - agentMinutes

    return { agentMinutes, manualEstimate, timeSavedMinutes, taskCount: count, avgSecondsPerTask }
}

// ─── CSV Export ──────────────────────────────────────────────────────────────

export interface TaskExportRow {
    type: string          // 'task' or 'team_run'
    date: string
    task_title: string
    agent_name: string
    team_name: string
    status: string
    model: string
    tokens: number
    cost_usd: number
    duration_seconds: number
}

/** Fetch all task + team run data for CSV export */
export async function fetchTasksForExport(
    workspaceId: string,
    startDate: string,
    endDate: string,
): Promise<TaskExportRow[]> {
    const [taskResult, teamRunResult, agentResult, teamResult] = await Promise.all([
        supabase
            .from('agent_tasks')
            .select('task_id, agent_id, status, model_used, tokens_used, cost_estimate_usd, started_at, completed_at')
            .eq('workspace_id', workspaceId)
            .gte('created_at', startDate)
            .lte('created_at', endDate),
        supabase
            .from('team_runs')
            .select('id, team_id, status, tokens_total, cost_estimate_usd, started_at, completed_at, input_task')
            .eq('workspace_id', workspaceId)
            .gte('created_at', startDate)
            .lte('created_at', endDate),
        supabase
            .from('agents')
            .select('id, name')
            .eq('workspace_id', workspaceId),
        supabase
            .from('teams')
            .select('id, name')
            .eq('workspace_id', workspaceId),
    ])

    if (taskResult.error) throw taskResult.error
    if (teamRunResult.error) throw teamRunResult.error
    if (agentResult.error) throw agentResult.error
    if (teamResult.error) throw teamResult.error

    const agentMap = new Map<string, string>()
    for (const a of agentResult.data as Array<{ id: string; name: string }>) {
        agentMap.set(a.id, a.name)
    }

    const teamMap = new Map<string, string>()
    for (const t of teamResult.data as Array<{ id: string; name: string }>) {
        teamMap.set(t.id, t.name)
    }

    // Fetch task titles
    const taskIds = [...new Set((taskResult.data as Array<{ task_id: string }>).map(r => r.task_id))]
    const titleMap = new Map<string, string>()

    if (taskIds.length > 0) {
        const titleResult = await supabase
            .from('tasks')
            .select('id, title')
            .in('id', taskIds)

        if (!titleResult.error) {
            for (const t of titleResult.data as Array<{ id: string; title: string }>) {
                titleMap.set(t.id, t.title)
            }
        }
    }

    // Task rows
    const taskRows: TaskExportRow[] = (taskResult.data as Array<{
        task_id: string; agent_id: string; status: string;
        model_used: string | null; tokens_used: number | null; cost_estimate_usd: number | null;
        started_at: string | null; completed_at: string | null
    }>).map(row => {
        const durationMs = row.started_at && row.completed_at
            ? new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()
            : 0
        return {
            type: 'task',
            date: row.completed_at?.slice(0, 10) ?? '',
            task_title: titleMap.get(row.task_id) ?? 'Unknown',
            agent_name: agentMap.get(row.agent_id) ?? 'Unknown',
            team_name: '',
            status: row.status,
            model: row.model_used ?? '',
            tokens: row.tokens_used ?? 0,
            cost_usd: row.cost_estimate_usd ?? 0,
            duration_seconds: Math.round(durationMs / 1000),
        }
    })

    // Team run rows
    const teamRunRows: TaskExportRow[] = (teamRunResult.data as Array<{
        id: string; team_id: string; status: string;
        tokens_total: number | null; cost_estimate_usd: number | null;
        started_at: string | null; completed_at: string | null;
        input_task: string
    }>).map(row => {
        const durationMs = row.started_at && row.completed_at
            ? new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()
            : 0
        return {
            type: 'team_run',
            date: row.completed_at?.slice(0, 10) ?? '',
            task_title: row.input_task.slice(0, 100),
            agent_name: '',
            team_name: teamMap.get(row.team_id) ?? 'Unknown',
            status: row.status,
            model: '',
            tokens: row.tokens_total ?? 0,
            cost_usd: row.cost_estimate_usd ?? 0,
            duration_seconds: Math.round(durationMs / 1000),
        }
    })

    return [...taskRows, ...teamRunRows].sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Token Breakdown (Prompt vs Completion) ──────────────────────────────────

export interface AgentTokenBreakdown {
    agentName: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    costUsd: number
}

/** Fetch prompt vs completion token split per agent for the date range */
export async function fetchTokenBreakdown(
    workspaceId: string,
    startDate: string,
    endDate: string,
): Promise<AgentTokenBreakdown[]> {
    const [usageResult, agentResult] = await Promise.all([
        supabase
            .from('usage_records')
            .select('agent_id, prompt_tokens, completion_tokens, tokens_used, cost_usd')
            .eq('workspace_id', workspaceId)
            .gte('recorded_at', startDate)
            .lte('recorded_at', endDate)
            .not('agent_id', 'is', null),
        supabase
            .from('agents')
            .select('id, name')
            .eq('workspace_id', workspaceId),
    ])

    if (usageResult.error) throw usageResult.error
    if (agentResult.error) throw agentResult.error

    const agentMap = new Map<string, string>()
    for (const a of agentResult.data as Array<{ id: string; name: string }>) {
        agentMap.set(a.id, a.name)
    }

    const breakdownMap = new Map<string, AgentTokenBreakdown>()

    for (const row of usageResult.data as Array<{
        agent_id: string
        prompt_tokens: number | null
        completion_tokens: number | null
        tokens_used: number
        cost_usd: number
    }>) {
        if (!row.agent_id) continue
        let entry = breakdownMap.get(row.agent_id)
        if (!entry) {
            entry = {
                agentName: agentMap.get(row.agent_id) ?? 'Unknown',
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                costUsd: 0,
            }
            breakdownMap.set(row.agent_id, entry)
        }
        entry.promptTokens += row.prompt_tokens ?? 0
        entry.completionTokens += row.completion_tokens ?? 0
        entry.totalTokens += row.tokens_used
        entry.costUsd += row.cost_usd
    }

    return Array.from(breakdownMap.values()).sort((a, b) => b.totalTokens - a.totalTokens)
}

// ─── Cost Forecast ───────────────────────────────────────────────────────────

export interface CostForecast {
    forecastDays: Array<{ date: string; projectedCost: number; cumulative: number }>
    monthlyEstimate: number
    trend: 'up' | 'down' | 'flat'
    trendPercent: number
    avgDailyCost: number
}

/**
 * Project future spend from historical DailyCost data using linear regression.
 * Uses the last 14–30 days of history to compute slope and projects 30 days forward.
 */
export function computeCostForecast(historicalData: DailyCost[]): CostForecast {
    // Use non-zero cost days for the regression
    const data = historicalData.filter(d => d.cost > 0)

    if (data.length < 2) {
        return {
            forecastDays: [],
            monthlyEstimate: 0,
            trend: 'flat',
            trendPercent: 0,
            avgDailyCost: 0,
        }
    }

    // Simple linear regression: y = mx + b where x is day index, y is daily cost
    const n = data.length
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0

    for (let i = 0; i < n; i++) {
        sumX += i
        sumY += data[i].cost
        sumXY += i * data[i].cost
        sumXX += i * i
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    const avgDailyCost = sumY / n

    // Determine trend
    const trendPercent = avgDailyCost > 0 ? (slope / avgDailyCost) * 100 : 0
    let trend: 'up' | 'down' | 'flat' = 'flat'
    if (trendPercent > 5) trend = 'up'
    else if (trendPercent < -5) trend = 'down'

    // Generate 30-day forecast from the last historical date
    const lastDate = new Date(data[data.length - 1].date)
    const forecastDays: Array<{ date: string; projectedCost: number; cumulative: number }> = []
    let cumulative = 0

    for (let i = 1; i <= 30; i++) {
        const forecastDate = new Date(lastDate)
        forecastDate.setDate(forecastDate.getDate() + i)
        const projectedCost = Math.max(0, intercept + slope * (n + i - 1))
        cumulative += projectedCost
        forecastDays.push({
            date: forecastDate.toISOString().slice(0, 10),
            projectedCost,
            cumulative,
        })
    }

    const monthlyEstimate = cumulative

    return { forecastDays, monthlyEstimate, trend, trendPercent, avgDailyCost }
}
