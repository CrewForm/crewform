import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    fetchA2AAgents,
    discoverAndRegisterAgent,
    toggleAgent,
    deleteA2AAgent,
    refreshAgentCard,
} from '@/db/a2aAgents'
import type { A2ARemoteAgent } from '@/db/a2aAgents'

export function useA2AAgents(workspaceId: string | undefined) {
    return useQuery<A2ARemoteAgent[]>({
        queryKey: ['a2a-agents', workspaceId],
        queryFn: () => fetchA2AAgents(workspaceId!),
        enabled: !!workspaceId,
    })
}

export function useDiscoverAgent(workspaceId: string | undefined) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (baseUrl: string) => discoverAndRegisterAgent(workspaceId!, baseUrl),
        onSuccess: () => { void qc.invalidateQueries({ queryKey: ['a2a-agents'] }) },
    })
}

export function useToggleAgent() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
            toggleAgent(id, isEnabled),
        onSuccess: () => { void qc.invalidateQueries({ queryKey: ['a2a-agents'] }) },
    })
}

export function useDeleteAgent() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => deleteA2AAgent(id),
        onSuccess: () => { void qc.invalidateQueries({ queryKey: ['a2a-agents'] }) },
    })
}

export function useRefreshAgentCard() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, baseUrl }: { id: string; baseUrl: string }) =>
            refreshAgentCard(id, baseUrl),
        onSuccess: () => { void qc.invalidateQueries({ queryKey: ['a2a-agents'] }) },
    })
}
