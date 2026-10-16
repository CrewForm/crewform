// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'

// ─── Usage Summary ───────────────────────────────────────────────────────────

export interface UsageSummary {
    totalTokens: number
    totalCostUsd: number
    taskExecutions: number
    teamRuns: number
}

/** Fetch aggregate usage for the date range */
export async function fetchUsageSummary(
    workspaceId: string,
    startDate: string,
    endDate: string,
): Promise<UsageSummary> {
    const { data, error } = await supabase
        .from('usage_records')
        .select('event_type, tokens_used, cost_usd')
        .eq('workspace_id', workspaceId)
        .gte('recorded_at', startDate)
        .lte('recorded_at', endDate)

    if (error) throw error

    let totalTokens = 0
    let totalCostUsd = 0
    let taskExecutions = 0
    let teamRuns = 0

    for (const row of data as Array<{ event_type: string; tokens_used: number; cost_usd: number }>) {
        totalTokens += row.tokens_used
        totalCostUsd += row.cost_usd
        if (row.event_type === 'task_execution') taskExecutions++
        if (row.event_type === 'team_run') teamRuns++
    }

    return { totalTokens, totalCostUsd, taskExecutions, teamRuns }
}

// ─── Usage Timeline ──────────────────────────────────────────────────────────

export interface UsageDayEntry {
    date: string
    tokens: number
    cost: number
    count: number
}

/** Fetch daily usage timeline for the date range */
export async function fetchUsageTimeline(
    workspaceId: string,
    startDate: string,
    endDate: string,
): Promise<UsageDayEntry[]> {
    const { data, error } = await supabase
        .from('usage_records')
        .select('recorded_at, tokens_used, cost_usd')
        .eq('workspace_id', workspaceId)
        .gte('recorded_at', startDate)
        .lte('recorded_at', endDate)

    if (error) throw error

    const dayMap = new Map<string, UsageDayEntry>()

    for (const row of data as Array<{ recorded_at: string; tokens_used: number; cost_usd: number }>) {
        const day = row.recorded_at.slice(0, 10)
        let entry = dayMap.get(day)
        if (!entry) {
            entry = { date: day, tokens: 0, cost: 0, count: 0 }
            dayMap.set(day, entry)
        }
        entry.tokens += row.tokens_used
        entry.cost += row.cost_usd
        entry.count++
    }

    // Fill in missing days
    const result: UsageDayEntry[] = []
    const current = new Date(startDate)
    const end = new Date(endDate)

    while (current <= end) {
        const dayStr = current.toISOString().slice(0, 10)
        result.push(dayMap.get(dayStr) ?? { date: dayStr, tokens: 0, cost: 0, count: 0 })
        current.setDate(current.getDate() + 1)
    }

    return result
}
