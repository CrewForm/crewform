// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    fetchGoogleConnection,
    deleteGoogleConnection,
    initiateGoogleOAuth,
} from '@/db/googleConnection'

export function useGoogleConnection(workspaceId?: string) {
    return useQuery({
        queryKey: ['google-connection', workspaceId],
        queryFn: () => fetchGoogleConnection(workspaceId ?? ''),
        enabled: !!workspaceId,
    })
}

export function useDisconnectGoogle(workspaceId?: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => deleteGoogleConnection(workspaceId ?? ''),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['google-connection', workspaceId] })
        },
    })
}

export function useInitiateGoogleOAuth(workspaceId?: string) {
    return useMutation({
        mutationFn: () => initiateGoogleOAuth(workspaceId ?? ''),
        onSuccess: (authUrl) => {
            window.location.href = authUrl
        },
    })
}
