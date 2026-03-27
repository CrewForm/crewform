// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    fetchMarketplaceAgents, fetchMarketplaceTags,
    submitAgentForReview, fetchMySubmissions, fetchPendingSubmissions,
    approveSubmission, rejectSubmission, fetchCreatorStats,
    submitAgentRating, fetchAgentReviews,
} from '@/db/marketplace'
import type { MarketplaceQueryOptions, MarketplaceSubmission, CreatorStats, AgentReview } from '@/db/marketplace'
import type { Agent } from '@/types'

const STALE_TIME = 5 * 60 * 1000 // 5 minutes — marketplace data doesn't change often

/** Fetch marketplace agents with search, tag filter, and sort */
export function useMarketplaceAgents(options: MarketplaceQueryOptions) {
    const { data = [], isLoading, error, refetch } = useQuery<Agent[]>({
        queryKey: ['marketplace-agents', options.search, options.tags, options.category, options.sort],
        queryFn: () => fetchMarketplaceAgents(options),
        staleTime: STALE_TIME,
    })
    return { agents: data, isLoading, error, refetch }
}

/** Fetch all unique marketplace tags for the filter UI */
export function useMarketplaceTags() {
    const { data = [], isLoading } = useQuery<string[]>({
        queryKey: ['marketplace-tags'],
        queryFn: fetchMarketplaceTags,
        staleTime: STALE_TIME,
    })
    return { tags: data, isLoading }
}

// ─── Publishing ─────────────────────────────────────────────────────────────

/** Submit an agent for marketplace review */
export function useSubmitAgent() {
    const queryClient = useQueryClient()
    return useMutation<MarketplaceSubmission, Error, { agentId: string; tags: string[]; userId: string }>({
        mutationFn: ({ agentId, tags, userId }) => submitAgentForReview(agentId, tags, userId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['my-submissions'] })
        },
    })
}

/** Fetch current user's submissions */
export function useMySubmissions(userId: string | null) {
    return useQuery<MarketplaceSubmission[]>({
        queryKey: ['my-submissions', userId],
        queryFn: () => {
            if (!userId) throw new Error('Missing userId')
            return fetchMySubmissions(userId)
        },
        enabled: !!userId,
        staleTime: 60 * 1000,
    })
}

/** Fetch pending submissions (admin) */
export function usePendingSubmissions() {
    return useQuery<MarketplaceSubmission[]>({
        queryKey: ['pending-submissions'],
        queryFn: fetchPendingSubmissions,
        staleTime: 30 * 1000,
    })
}

/** Approve a submission */
export function useApproveSubmission() {
    const queryClient = useQueryClient()
    return useMutation<undefined, Error, { id: string; reviewerId: string }>({
        mutationFn: async ({ id, reviewerId }) => {
            await approveSubmission(id, reviewerId)
            return undefined
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['pending-submissions'] })
            void queryClient.invalidateQueries({ queryKey: ['marketplace-agents'] })
        },
    })
}

/** Reject a submission */
export function useRejectSubmission() {
    const queryClient = useQueryClient()
    return useMutation<undefined, Error, { id: string; reviewerId: string; notes: string }>({
        mutationFn: async ({ id, reviewerId, notes }) => {
            await rejectSubmission(id, reviewerId, notes)
            return undefined
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['pending-submissions'] })
        },
    })
}

/** Fetch creator statistics */
export function useCreatorStats(workspaceId: string | null) {
    return useQuery<CreatorStats>({
        queryKey: ['creator-stats', workspaceId],
        queryFn: () => {
            if (!workspaceId) throw new Error('Missing workspaceId')
            return fetchCreatorStats(workspaceId)
        },
        enabled: !!workspaceId,
        staleTime: 60 * 1000,
    })
}

// ─── Ratings ────────────────────────────────────────────────────────────────

/** Fetch reviews for a specific agent */
export function useAgentReviews(agentId: string | null) {
    return useQuery<AgentReview[]>({
        queryKey: ['agent-reviews', agentId],
        queryFn: () => {
            if (!agentId) throw new Error('Missing agentId')
            return fetchAgentReviews(agentId)
        },
        enabled: !!agentId,
        staleTime: 60 * 1000,
    })
}

/** Submit or update a rating for a marketplace agent */
export function useSubmitRating() {
    const queryClient = useQueryClient()
    return useMutation<AgentReview, Error, { agentId: string; userId: string; workspaceId: string; rating: number; reviewText?: string }>({
        mutationFn: ({ agentId, userId, workspaceId, rating, reviewText }) =>
            submitAgentRating(agentId, userId, workspaceId, rating, reviewText ?? ''),
        onSuccess: (_data, vars) => {
            void queryClient.invalidateQueries({ queryKey: ['agent-reviews', vars.agentId] })
            void queryClient.invalidateQueries({ queryKey: ['marketplace-agents'] })
        },
    })
}
