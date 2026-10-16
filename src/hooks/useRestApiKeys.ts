// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/hooks/useWorkspace'
import { fetchRestApiKeys, createRestApiKey, deleteRestApiKey } from '@/db/restApiKeys'
import type { RestApiKey } from '@/db/restApiKeys'

const QUERY_KEY = 'rest-api-keys'

/** Fetch all REST API keys for the current workspace */
export function useRestApiKeys() {
    const { workspaceId } = useWorkspace()
    return useQuery<RestApiKey[]>({
        queryKey: [QUERY_KEY, workspaceId],
        queryFn: () => fetchRestApiKeys(workspaceId ?? ''),
        enabled: !!workspaceId,
    })
}

/** Create a new REST API key */
export function useCreateRestApiKey() {
    const qc = useQueryClient()
    const { workspaceId } = useWorkspace()
    return useMutation({
        mutationFn: ({ name, userId }: { name: string; userId: string }) =>
            createRestApiKey(workspaceId ?? '', name, userId),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEY] })
        },
    })
}

/** Delete a REST API key */
export function useDeleteRestApiKey() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => deleteRestApiKey(id),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEY] })
        },
    })
}
