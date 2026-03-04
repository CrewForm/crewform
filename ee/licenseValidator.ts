// CrewForm Enterprise License
// Copyright (C) 2026 CrewForm (AntiGravity Pty Ltd)
// Licensed under the CrewForm Enterprise License (see ee/LICENSE)
//
// licenseValidator.ts — License key validation using HMAC-SHA256 signatures.
// Keys are validated offline (no phone-home) for self-hosted deployments.

import { createHmac } from 'crypto';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LicensePayload {
    plan: string;
    workspaceId: string;
    seats: number;
    features: string[];
    validUntil: string | null; // ISO date or null for perpetual
}

export interface LicenseValidationResult {
    valid: boolean;
    reason?: string;
    payload?: LicensePayload;
}

// ─── Key Format ─────────────────────────────────────────────────────────────
//
// License keys use the format:
//   CF-{plan}-{base64Payload}-{hmacSignature}
//
// Where:
//   - plan: 'pro' | 'team' | 'enterprise'
//   - base64Payload: base64url-encoded JSON of LicensePayload
//   - hmacSignature: HMAC-SHA256 hex signature of the payload
//
// The signing secret is stored as an environment variable CREWFORM_LICENSE_SECRET.
// For CrewForm Cloud, this is set in the deployment config.
// For self-hosted, customers receive a pre-signed key — they don't need the secret.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a license key (used by CrewForm admin tooling only).
 * Requires the CREWFORM_LICENSE_SECRET environment variable.
 */
export function generateLicenseKey(payload: LicensePayload): string {
    const secret = process.env.CREWFORM_LICENSE_SECRET;
    if (!secret) {
        throw new Error('CREWFORM_LICENSE_SECRET is required to generate license keys');
    }

    const payloadJson = JSON.stringify(payload);
    const payloadB64 = Buffer.from(payloadJson).toString('base64url');
    const signature = createHmac('sha256', secret).update(payloadB64).digest('hex');

    return `CF-${payload.plan}-${payloadB64}-${signature}`;
}

/**
 * Validate a license key. Works offline — no external API calls.
 * Returns the decoded payload if valid, or an error reason if not.
 */
export function validateLicenseKey(licenseKey: string): LicenseValidationResult {
    const secret = process.env.CREWFORM_LICENSE_SECRET;
    if (!secret) {
        return { valid: false, reason: 'License validation not configured (missing secret)' };
    }

    // Parse key format
    const parts = licenseKey.split('-');
    if (parts.length < 4 || parts[0] !== 'CF') {
        return { valid: false, reason: 'Invalid license key format' };
    }

    const plan = parts[1];
    const payloadB64 = parts.slice(2, -1).join('-'); // Handle base64url padding chars
    const signature = parts[parts.length - 1];

    // Verify signature
    const expectedSignature = createHmac('sha256', secret).update(payloadB64).digest('hex');
    if (signature !== expectedSignature) {
        return { valid: false, reason: 'Invalid license key signature' };
    }

    // Decode payload
    let payload: LicensePayload;
    try {
        const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
        payload = JSON.parse(payloadJson) as LicensePayload;
    } catch {
        return { valid: false, reason: 'Corrupted license key payload' };
    }

    // Verify plan matches
    if (payload.plan !== plan) {
        return { valid: false, reason: 'License key plan mismatch' };
    }

    // Check expiry
    if (payload.validUntil) {
        const expiryDate = new Date(payload.validUntil);
        if (expiryDate < new Date()) {
            return { valid: false, reason: 'License key has expired' };
        }
    }

    return { valid: true, payload };
}

/**
 * Check if a specific feature is enabled by a license payload.
 */
export function hasFeature(payload: LicensePayload, feature: string): boolean {
    return payload.features.includes(feature);
}
