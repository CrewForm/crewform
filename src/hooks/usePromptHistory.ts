// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery } from '@tanstack/react-query'
import { fetchPromptHistory } from '@/db/promptHistory'

/** Fetch prompt version history for an agent */
export function usePromptHistory(agentId: string | undefined) {
    return useQuery({
        queryKey: ['prompt-history', agentId],
        queryFn: () => {
            if (!agentId) throw new Error('Missing agentId')
            return fetchPromptHistory(agentId)
        },
        enabled: !!agentId,
    })
}
