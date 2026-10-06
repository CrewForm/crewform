// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// license.ts — Server-side EE feature gating for the task-runner.
// Checks the ee_licenses table to determine if EE features are enabled
// for a given workspace. When CREWFORM_LICENSE_SECRET is set, validates
// key signatures to prevent forged licenses.

import { supabase } from './supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

interface EELicense {
    id: string
    license_key: string
    plan: string
    features: string[]
    seats: number
    valid_until: string | null
    status: string
    metadata: Record<string, unknown>
}

interface ValidationResult {
    valid: boolean
    plan?: string
    features?: string[]
    seats?: number
    validUntil?: string | null
    error?: string
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const licenseCache = new Map<string, { license: EELicense | null; fetchedAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Startup validation state
let startupValidationDone = false
const validatedKeys = new Set<string>() // Keys that passed signature check
const REVALIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000      // 7-day offline grace

// ─── HMAC-SHA256 Signature Verification ─────────────────────────────────────

async function hmacSign(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder()
    const key = await globalThis.crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    )
    const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(payload))
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

/**
 * Verify a licence key's HMAC-SHA256 signature and decode its payload.
 */
async function verifyKeySignature(licenseKey: string, secret: string): Promise<ValidationResult> {
    const parts = licenseKey.split('-')
    if (parts.length < 4 || parts[0] !== 'CF') {
        return { valid: false, error: 'Invalid license key format' }
    }

    const signatureHex = parts[parts.length - 1]
    const payloadB64 = parts.slice(2, -1).join('-')

    // Verify HMAC
    const expectedSig = await hmacSign(payloadB64, secret)
    if (signatureHex !== expectedSig) {
        return { valid: false, error: 'Invalid license key signature — key may be tampered or forged' }
    }

    // Decode Base64url payload
    try {
        const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/')
        const decoded = Buffer.from(padded, 'base64').toString('utf-8')
        const payload = JSON.parse(decoded) as {
            plan: string; workspaceId: string; seats: number; features: string[]; validUntil: string | null
        }

        if (payload.validUntil && new Date(payload.validUntil) < new Date()) {
            return { valid: false, plan: payload.plan, error: `License expired on ${payload.validUntil}` }
        }

        return { valid: true, plan: payload.plan, features: payload.features, seats: payload.seats, validUntil: payload.validUntil }
    } catch {
        return { valid: false, error: 'Corrupted license key payload' }
    }
}

// ─── Startup Validation ─────────────────────────────────────────────────────

/**
 * Validate all active EE licences on startup.
 * When CREWFORM_LICENSE_SECRET is set, verifies HMAC signatures.
 * Call this once from the task runner's start() function.
 */
export async function validateLicensesOnStartup(): Promise<void> {
    const secret = process.env.CREWFORM_LICENSE_SECRET

    // Fetch all active licences
    const { data: licenses, error } = await supabase
        .from('ee_licenses')
        .select('id, license_key, plan, features, seats, valid_until, status, metadata')
        .eq('status', 'active')

    if (error) {
        console.log('[License] Failed to fetch licenses:', error.message)
        startupValidationDone = true
        return
    }

    if (!licenses || licenses.length === 0) {
        console.log('[License] No active EE licenses — running in CE mode')
        startupValidationDone = true
        return
    }

    if (!secret) {
        // Hosted mode: Stripe auto-provisions licences, no signing secret available.
        // Trust DB rows (they were created by our own Edge Function / Stripe webhook).
        const count = licenses.length
        console.log(`[License] ${count} active license(s) found — signature check skipped (no CREWFORM_LICENSE_SECRET)`)
        for (const row of licenses as EELicense[]) {
            validatedKeys.add(row.license_key)
        }
        startupValidationDone = true
        return
    }

    // Self-hosted mode: validate signatures
    let validCount = 0
    for (const row of licenses as EELicense[]) {
        if (row.license_key === 'manual-grant') {
            // Legacy manual grants can't be validated — skip
            console.log(`[License] ⚠️  Legacy manual-grant license (${row.id}) cannot be signature-verified`)
            continue
        }

        const result = await verifyKeySignature(row.license_key, secret)

        if (result.valid) {
            validCount++
            validatedKeys.add(row.license_key)
            console.log(`[License] ✅ Valid: ${result.plan} plan (${result.features?.length ?? 0} features, ${result.seats ?? 0} seats)`)

            // Update validated_at in metadata
            const existingMeta = (typeof row.metadata === 'object' && row.metadata !== null) ? row.metadata : {}
            await supabase
                .from('ee_licenses')
                .update({ metadata: { ...existingMeta, validated_at: new Date().toISOString() } })
                .eq('id', row.id)
        } else {
            console.warn(`[License] ❌ Invalid license (${row.id}): ${result.error}`)

            // Mark as invalid
            await supabase
                .from('ee_licenses')
                .update({ status: 'invalid', metadata: { validation_error: result.error, validated_at: new Date().toISOString() } })
                .eq('id', row.id)
        }
    }

    if (validCount === 0) {
        console.log('[License] No valid EE licenses after signature verification — running in CE mode')
    }

    startupValidationDone = true

    // Schedule periodic re-validation
    const timer = setInterval(() => {
        console.log('[License] Running periodic re-validation...')
        validatedKeys.clear()
        void validateLicensesOnStartup()
    }, REVALIDATION_INTERVAL_MS)
    if (timer && typeof timer === 'object' && 'unref' in timer) {
        (timer as NodeJS.Timeout).unref()
    }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Check if a specific EE feature is enabled for a workspace.
 * Results are cached for 5 minutes to reduce DB queries.
 */
export async function isFeatureEnabled(workspaceId: string, feature: string): Promise<boolean> {
    if (['orchestrator_mode', 'marketplace_publish', 'a2a_publish', 'chat_widget'].includes(feature)) return true
    // CE build — paid features disabled
    if (process.env.CREWFORM_EDITION === 'ce') {
        return false
    }

    const license = await getWorkspaceLicense(workspaceId)
    if (!license) return false

    // If startup validation ran and this key wasn't validated, reject it
    const secret = process.env.CREWFORM_LICENSE_SECRET
    if (secret && startupValidationDone && license.license_key !== 'manual-grant') {
        if (!validatedKeys.has(license.license_key)) {
            return false
        }
    }

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
            .select('id, license_key, plan, features, seats, valid_until, status, metadata')
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

