// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
    fetchSubscription, fetchCurrentUsage, checkQuota,
    createCheckoutSession, createPortalSession,
} from '@/db/billing'
import type { Subscription, UsageSummary, QuotaCheckResult } from '@/db/billing'

/** Current workspace subscription */
export function useSubscription(workspaceId: string | null) {
    return useQuery<Subscription | null>({
        queryKey: ['subscription', workspaceId],
        queryFn: () => {
            if (!workspaceId) return null
            return fetchSubscription(workspaceId)
        },
        enabled: !!workspaceId,
        staleTime: 5 * 60 * 1000,
    })
}

/** Current resource usage */
export function useUsage(workspaceId: string | null) {
    return useQuery<UsageSummary>({
        queryKey: ['usage', workspaceId],
        queryFn: () => {
            if (!workspaceId) throw new Error('Missing workspaceId')
            return fetchCurrentUsage(workspaceId)
        },
        enabled: !!workspaceId,
        staleTime: 60 * 1000,
    })
}

/** Check if a specific resource is within quota */
export function useQuotaCheck(workspaceId: string | null, resource: string) {
    return useQuery<QuotaCheckResult>({
        queryKey: ['quota', workspaceId, resource],
        queryFn: () => {
            if (!workspaceId) throw new Error('Missing workspaceId')
            return checkQuota(workspaceId, resource)
        },
        enabled: !!workspaceId,
        staleTime: 30 * 1000,
    })
}

/** Start a checkout session */
export function useCreateCheckout() {
    return useMutation<{ url: string }, Error, { workspaceId: string; plan: 'pro' | 'team' }>({
        mutationFn: ({ workspaceId, plan }) => createCheckoutSession(workspaceId, plan),
        onSuccess: ({ url }) => {
            if (url) {
                window.location.href = url
            }
        },
        onError: (err) => {
            toast.error(err.message || 'Failed to start checkout')
        },
    })
}

/** Open Stripe Customer Portal */
export function useCreatePortal() {
    return useMutation<{ url: string }, Error, { workspaceId: string }>({
        mutationFn: ({ workspaceId }) => createPortalSession(workspaceId),
        onSuccess: ({ url }) => {
            if (url) {
                window.location.href = url
            }
        },
        onError: (err) => {
            toast.error(err.message || 'Failed to open billing portal')
        },
    })
}
