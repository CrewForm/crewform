// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    fetchChannels,
    createChannel,
    updateChannel,
    deleteChannel,
    fetchChannelLogs,
} from '@/db/messagingChannels'
import type { CreateChannelInput, UpdateChannelInput } from '@/db/messagingChannels'

export function useMessagingChannels(workspaceId?: string) {
    return useQuery({
        queryKey: ['messaging-channels', workspaceId],
        queryFn: () => fetchChannels(workspaceId ?? ''),
        enabled: !!workspaceId,
    })
}

export function useCreateChannel() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: CreateChannelInput) => createChannel(input),
        onSuccess: (_data, variables) => {
            void qc.invalidateQueries({ queryKey: ['messaging-channels', variables.workspace_id] })
        },
    })
}

export function useUpdateChannel(workspaceId?: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: UpdateChannelInput }) =>
            updateChannel(id, input),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['messaging-channels', workspaceId] })
        },
    })
}

export function useDeleteChannel(workspaceId?: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => deleteChannel(id),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['messaging-channels', workspaceId] })
        },
    })
}

export function useChannelLogs(channelId?: string) {
    return useQuery({
        queryKey: ['channel-logs', channelId],
        queryFn: () => fetchChannelLogs(channelId ?? ''),
        enabled: !!channelId,
    })
}
