// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { upsertApiKey } from '@/db/apiKeys'
import type { UpsertApiKeyInput } from '@/db/apiKeys'
import type { ApiKey } from '@/types'

/**
 * React Query mutation for saving (upsert) an API key.
 */
export function useSaveApiKey() {
    const queryClient = useQueryClient()

    return useMutation<ApiKey, Error, UpsertApiKeyInput>({
        mutationFn: upsertApiKey,
        onSuccess: (saved) => {
            void queryClient.invalidateQueries({ queryKey: ['apiKeys', saved.workspace_id] })
        },
    })
}
