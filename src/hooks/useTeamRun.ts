// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchTeamRun, fetchTeamMessages, fetchTeamHandoffs } from '@/db/teamRuns'
import type { TeamRun, TeamMessage, TeamHandoff } from '@/types'

/**
 * React Query hook for a single team run + Supabase Realtime subscription.
 * Automatically refetches when team_runs, team_messages, or team_handoffs change.
 */
export function useTeamRun(runId: string | null) {
    const queryClient = useQueryClient()

    const {
        data: run,
        isLoading: isLoadingRun,
        error: runError,
    } = useQuery<TeamRun>({
        queryKey: ['team-run', runId],
        queryFn: () => fetchTeamRun(runId ?? ''),
        enabled: !!runId,
        staleTime: 5 * 1000,
    })

    const {
        data: messages = [],
        isLoading: isLoadingMessages,
    } = useQuery<TeamMessage[]>({
        queryKey: ['team-run-messages', runId],
        queryFn: () => fetchTeamMessages(runId ?? ''),
        enabled: !!runId,
        staleTime: 5 * 1000,
    })

    const {
        data: handoffs = [],
        isLoading: isLoadingHandoffs,
    } = useQuery<TeamHandoff[]>({
        queryKey: ['team-run-handoffs', runId],
        queryFn: () => fetchTeamHandoffs(runId ?? ''),
        enabled: !!runId,
        staleTime: 5 * 1000,
    })

    // ─── Realtime subscriptions ──────────────────────────────────────────

    useEffect(() => {
        if (!runId) return

        const channel = supabase
            .channel(`team-run-${runId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'team_runs', filter: `id=eq.${runId}` },
                () => {
                    void queryClient.invalidateQueries({ queryKey: ['team-run', runId] })
                    void queryClient.invalidateQueries({ queryKey: ['team-runs'] })
                },
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'team_messages', filter: `run_id=eq.${runId}` },
                () => {
                    void queryClient.invalidateQueries({ queryKey: ['team-run-messages', runId] })
                },
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'team_handoffs', filter: `run_id=eq.${runId}` },
                () => {
                    void queryClient.invalidateQueries({ queryKey: ['team-run-handoffs', runId] })
                },
            )
            .subscribe()

        return () => {
            void supabase.removeChannel(channel)
        }
    }, [runId, queryClient])

    return {
        run,
        messages,
        handoffs,
        isLoading: isLoadingRun || isLoadingMessages || isLoadingHandoffs,
        error: runError,
    }
}
