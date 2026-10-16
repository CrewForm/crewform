// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface Delegation {
    id: string
    team_run_id: string
    worker_agent_id: string
    instruction: string
    worker_output: string | null
    status: 'pending' | 'running' | 'completed' | 'revision_requested' | 'failed'
    revision_count: number
    revision_feedback: string | null
    quality_score: number | null
    parent_delegation_id: string | null
    created_at: string
    completed_at: string | null
}

/**
 * Real-time hook for delegation records within a team run.
 */
export function useDelegations(teamRunId: string | null) {
    const [delegations, setDelegations] = useState<Delegation[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!teamRunId) {
            setDelegations([])
            setIsLoading(false)
            return
        }

        let channel: RealtimeChannel | null = null

        async function fetchDelegations() {
            setIsLoading(true)
            const { data, error } = await supabase
                .from('delegations')
                .select('*')
                .eq('team_run_id', teamRunId)
                .order('created_at', { ascending: true })

            if (!error) {
                setDelegations(data as Delegation[])
            }
            setIsLoading(false)
        }

        void fetchDelegations()

        // Subscribe to real-time changes
        channel = supabase
            .channel(`delegations:${teamRunId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'delegations',
                    filter: `team_run_id=eq.${teamRunId}`,
                },
                (payload) => {
                    const eventType = payload.eventType
                    if (eventType === 'INSERT') {
                        setDelegations((prev) => [...prev, payload.new as Delegation])
                    } else if (eventType === 'UPDATE') {
                        setDelegations((prev) =>
                            prev.map((d) => (d.id === (payload.new as Delegation).id ? (payload.new as Delegation) : d)),
                        )
                    } else {
                        setDelegations((prev) => prev.filter((d) => d.id !== (payload.old as Delegation).id))
                    }
                },
            )
            .subscribe()

        return () => {
            void supabase.removeChannel(channel)
        }
    }, [teamRunId])

    return { delegations, isLoading }
}
