// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'
import { fetchApiKeys } from '@/db/apiKeys'
import type { ApiKey } from '@/types'

/**
 * React Query hook for fetching API keys indexed by provider.
 */
export function useApiKeys(workspaceId: string | null) {
    const {
        data: keys,
        isLoading,
        error,
    } = useQuery<ApiKey[]>({
        queryKey: ['apiKeys', workspaceId],
        queryFn: () => fetchApiKeys(workspaceId ?? ''),
        enabled: !!workspaceId,
        staleTime: 60 * 1000, // 1 minute
    })

    // Index by provider for easy lookup
    const keysByProvider = new Map<string, ApiKey>()
    if (keys) {
        for (const key of keys) {
            keysByProvider.set(key.provider, key)
        }
    }

    return { keys: keys ?? [], keysByProvider, isLoading, error }
}
