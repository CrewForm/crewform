// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    fetchTriggers, fetchTeamTriggers, createTrigger, createTeamTrigger,
    updateTriggerEnabled, deleteTrigger, fetchTriggerLog,
} from '@/db/triggers'
import type { AgentTrigger, CreateTriggerInput, CreateTeamTriggerInput, TriggerLogEntry } from '@/db/triggers'

/** Fetch all triggers for an agent */
export function useTriggers(agentId: string | undefined) {
    return useQuery<AgentTrigger[]>({
        queryKey: ['triggers', agentId],
        queryFn: () => {
            if (!agentId) throw new Error('Missing agentId')
            return fetchTriggers(agentId)
        },
        enabled: !!agentId,
    })
}

/** Fetch all triggers for a team */
export function useTeamTriggers(teamId: string | undefined) {
    return useQuery<AgentTrigger[]>({
        queryKey: ['teamTriggers', teamId],
        queryFn: () => {
            if (!teamId) throw new Error('Missing teamId')
            return fetchTeamTriggers(teamId)
        },
        enabled: !!teamId,
    })
}

/** Create a new trigger for an agent */
export function useCreateTrigger() {
    const queryClient = useQueryClient()

    return useMutation<AgentTrigger, Error, CreateTriggerInput>({
        mutationFn: (input) => createTrigger(input),
        onSuccess: (trigger) => {
            void queryClient.invalidateQueries({ queryKey: ['triggers', trigger.agent_id] })
        },
    })
}

/** Create a new trigger for a team */
export function useCreateTeamTrigger() {
    const queryClient = useQueryClient()

    return useMutation<AgentTrigger, Error, CreateTeamTriggerInput>({
        mutationFn: (input) => createTeamTrigger(input),
        onSuccess: (trigger) => {
            void queryClient.invalidateQueries({ queryKey: ['teamTriggers', trigger.team_id] })
        },
    })
}

/** Toggle trigger enabled/disabled */
export function useToggleTrigger() {
    const queryClient = useQueryClient()

    return useMutation<AgentTrigger, Error, { id: string; enabled: boolean; agentId?: string; teamId?: string }>({
        mutationFn: ({ id, enabled }) => updateTriggerEnabled(id, enabled),
        onSuccess: (_data, { agentId, teamId }) => {
            if (agentId) void queryClient.invalidateQueries({ queryKey: ['triggers', agentId] })
            if (teamId) void queryClient.invalidateQueries({ queryKey: ['teamTriggers', teamId] })
        },
    })
}

/** Delete a trigger */
export function useDeleteTrigger() {
    const queryClient = useQueryClient()

    return useMutation<undefined, Error, { id: string; agentId?: string; teamId?: string }>({
        mutationFn: async ({ id }) => {
            await deleteTrigger(id)
            return undefined
        },
        onSuccess: (_data, { agentId, teamId }) => {
            if (agentId) void queryClient.invalidateQueries({ queryKey: ['triggers', agentId] })
            if (teamId) void queryClient.invalidateQueries({ queryKey: ['teamTriggers', teamId] })
        },
    })
}

/** Fetch trigger log entries */
export function useTriggerLog(triggerId: string | undefined) {
    return useQuery<TriggerLogEntry[]>({
        queryKey: ['trigger-log', triggerId],
        queryFn: () => {
            if (!triggerId) throw new Error('Missing triggerId')
            return fetchTriggerLog(triggerId)
        },
        enabled: !!triggerId,
    })
}

