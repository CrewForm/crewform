// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteApiKey } from '@/db/apiKeys'

/**
 * React Query mutation for removing an API key.
 */
export function useRemoveApiKey() {
    const queryClient = useQueryClient()

    return useMutation<undefined, Error, { id: string; workspaceId: string }>({
        mutationFn: async ({ id, workspaceId }) => {
            await deleteApiKey(workspaceId, id)
            return undefined
        },
        onSuccess: (_data, { workspaceId }) => {
            void queryClient.invalidateQueries({ queryKey: ['apiKeys', workspaceId] })
        },
    })
}
