// SPDX-License-Identifier: AGPL-3.0-or-later
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
        queryFn: () => fetchGoogleConnection(workspaceId!),
        enabled: !!workspaceId,
    })
}

export function useDisconnectGoogle(workspaceId?: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => deleteGoogleConnection(workspaceId!),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['google-connection', workspaceId] })
        },
    })
}

export function useInitiateGoogleOAuth() {
    return useMutation({
        mutationFn: initiateGoogleOAuth,
        onSuccess: (authUrl) => {
            window.location.href = authUrl
        },
    })
}
