// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EELicense {
    id: string
    workspace_id: string
    license_key: string
    plan: string
    features: string[]
    seats: number
    valid_from: string
    valid_until: string | null
    status: string
    metadata: Record<string, unknown>
    created_at: string
}

export interface LicenseValidationResult {
    valid: boolean
    plan?: string
    seats?: number
    features?: string[]
    validUntil?: string | null
    error?: string
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Fetch the active EE license for a workspace.
 * Returns null if no license exists (Community Edition).
 */
export async function fetchEELicense(workspaceId: string): Promise<EELicense | null> {
    const result = await supabase
        .from('ee_licenses')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .maybeSingle()

    if (result.error) {
        // Table might not exist yet (migration not applied) — treat as CE
        console.warn('[EELicense] Lookup failed:', result.error.message)
        return null
    }

    if (!result.data) return null

    const license = result.data as EELicense

    // Check expiry client-side
    if (license.valid_until && new Date(license.valid_until) < new Date()) {
        return null
    }

    return license
}

/**
 * Validate a licence key by calling the validate-license Edge Function.
 * Returns the validation result including decoded payload or error.
 */
export async function validateLicenseKey(
    licenseKey: string,
    workspaceId?: string,
): Promise<LicenseValidationResult> {
    const result = await supabase.functions.invoke('validate-license', {
        body: { licenseKey, workspaceId },
    })

    if (result.error) {
        const err = result.error as { message?: string }
        return { valid: false, error: err.message ?? 'Validation failed' }
    }

    return result.data as LicenseValidationResult
}

/**
 * Get the validated_at timestamp from a licence's metadata.
 * Returns null if never validated.
 */
export function getValidatedAt(license: EELicense): Date | null {
    const ts = license.metadata.validated_at
    if (typeof ts === 'string') {
        const d = new Date(ts)
        return isNaN(d.getTime()) ? null : d
    }
    return null
}

