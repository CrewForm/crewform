// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { checkQuota } from '@/db/billing'
import type { QuotaCheckResult } from '@/db/billing'

/**
 * Quota-aware wrapper for create operations.
 * Checks quota before executing the mutation and throws a descriptive error if over limit.
 * Beta workspaces bypass all limits (handled inside checkQuota).
 */
export async function enforceQuota(
    workspaceId: string,
    resource: string,
): Promise<void> {
    const result: QuotaCheckResult = await checkQuota(workspaceId, resource)

    if (!result.allowed) {
        const limitLabel = result.limit === -1 ? 'unlimited' : String(result.limit)
        throw new Error(
            `Plan limit reached: you've used ${result.current}/${limitLabel} ${resource.replace(/_/g, ' ')}. ` +
            'Upgrade your plan in Settings → Billing to add more.',
        )
    }
}
