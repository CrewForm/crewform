// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// license.ts — Server-side EE feature gating for the task-runner.
// Checks the ee_licenses table to determine if EE features are enabled
// for a given workspace.

import { supabase } from './supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

interface EELicense {
    plan: string
    features: string[]
    valid_until: string | null
    status: string
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const licenseCache = new Map<string, { license: EELicense | null; fetchedAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Check if a specific EE feature is enabled for a workspace.
 * Results are cached for 5 minutes to reduce DB queries.
 */
export async function isFeatureEnabled(workspaceId: string, feature: string): Promise<boolean> {
    // CE build — always disabled
    if (process.env.CREWFORM_EDITION === 'ce') {
        return false
    }

    const license = await getWorkspaceLicense(workspaceId)
    if (!license) return false

    return license.features.includes(feature)
}

/**
 * Fetch and cache the EE license for a workspace.
 */
async function getWorkspaceLicense(workspaceId: string): Promise<EELicense | null> {
    const cached = licenseCache.get(workspaceId)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.license
    }

    try {
        const { data, error } = await supabase
            .from('ee_licenses')
            .select('plan, features, valid_until, status')
            .eq('workspace_id', workspaceId)
            .eq('status', 'active')
            .maybeSingle()

        if (error) {
            // Table might not exist yet — treat as CE
            console.warn(`[License] Lookup failed for ${workspaceId}:`, error.message)
            licenseCache.set(workspaceId, { license: null, fetchedAt: Date.now() })
            return null
        }

        let license: EELicense | null = data as EELicense | null

        // Check expiry
        if (license?.valid_until && new Date(license.valid_until) < new Date()) {
            license = null
        }

        licenseCache.set(workspaceId, { license, fetchedAt: Date.now() })
        return license
    } catch (err) {
        console.error(`[License] Error fetching license for ${workspaceId}:`, err)
        return null
    }
}

/**
 * Clear the license cache (e.g., after a license update).
 */
export function clearLicenseCache(workspaceId?: string) {
    if (workspaceId) {
        licenseCache.delete(workspaceId)
    } else {
        licenseCache.clear()
    }
}
