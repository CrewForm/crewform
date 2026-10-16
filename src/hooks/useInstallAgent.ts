// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { installMarketplaceAgent } from '@/db/installAgent'
import type { InstallResult } from '@/db/installAgent'

interface InstallAgentInput {
    agentId: string
    workspaceId: string
    userId: string
}

/**
 * React Query mutation for installing a marketplace agent.
 * Invalidates marketplace-agents and agents queries on success.
 */
export function useInstallAgent() {
    const queryClient = useQueryClient()

    return useMutation<InstallResult, Error, InstallAgentInput>({
        mutationFn: ({ agentId, workspaceId, userId }) =>
            installMarketplaceAgent(agentId, workspaceId, userId),
        onSuccess: () => {
            // Refresh marketplace (install counts) and user's agents list
            void queryClient.invalidateQueries({ queryKey: ['marketplace-agents'] })
            void queryClient.invalidateQueries({ queryKey: ['agents'] })
        },
    })
}
