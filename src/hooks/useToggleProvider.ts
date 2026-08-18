// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toggleProviderActive } from '@/db/apiKeys'
import type { ApiKey } from '@/types'

/**
 * React Query mutation for toggling a provider's active state.
 */
export function useToggleProvider() {
    const queryClient = useQueryClient()

    return useMutation<ApiKey, Error, { id: string; isActive: boolean; workspaceId: string }>({
        mutationFn: ({ id, isActive, workspaceId }) => toggleProviderActive(workspaceId, id, isActive),
        onSuccess: (_data, { workspaceId }) => {
            void queryClient.invalidateQueries({ queryKey: ['apiKeys', workspaceId] })
        },
    })
}
