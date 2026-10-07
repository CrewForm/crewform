// SPDX-License-Identifier: AGPL-3.0-or-later
import { readJson } from '../_shared/body.ts';
// Copyright (C) 2026 CrewForm
//
// validate-license — Verify an EE license key signature.
// Can be called by self-hosted task runners to confirm key authenticity.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { ok, badRequest, unauthorized, serverError, methodNotAllowed } from '../_shared/response.ts';

// ─── HMAC-SHA256 verification ────────────────────────────────────────────────

async function hmacSign(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function fromBase64url(str: string): string {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/');
    return atob(padded);
}

interface LicensePayload {
    plan: string;
    workspaceId: string;
    seats: number;
    features: string[];
    validUntil: string | null;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;
    if (req.method !== 'POST') return methodNotAllowed();

    try {
        const body = await readJson(req) as { licenseKey?: string; workspaceId?: string };

        if (!body.licenseKey) {
            return badRequest('licenseKey is required');
        }

        const licenseKey = body.licenseKey;
        const secret = Deno.env.get('CREWFORM_LICENSE_SECRET');
        if (!secret) {
            return serverError('License signing not configured');
        }

        // Parse key: CF-{plan}-{base64url(payload)}-{signature}
        const parts = licenseKey.split('-');
        if (parts.length < 4 || parts[0] !== 'CF') {
            return ok({
                valid: false,
                error: 'Invalid license key format',
            });
        }

        // The plan is parts[1], the payload is everything between plan and the last segment (sig)
        // Key format: CF-enterprise-<base64url>-<hex_sig>
        const signatureHex = parts[parts.length - 1];
        const payloadB64 = parts.slice(2, -1).join('-');

        // Verify HMAC signature
        const expectedSig = await hmacSign(payloadB64, secret);

        if (signatureHex !== expectedSig) {
            return ok({
                valid: false,
                error: 'Invalid license key signature',
            });
        }

        // Decode payload
        let payload: LicensePayload;
        try {
            payload = JSON.parse(fromBase64url(payloadB64)) as LicensePayload;
        } catch {
            return ok({
                valid: false,
                error: 'Corrupted license key payload',
            });
        }

        // Check workspace match if provided
        if (body.workspaceId && payload.workspaceId !== body.workspaceId) {
            return ok({
                valid: false,
                error: 'License key is not valid for this workspace',
            });
        }

        // Check expiry
        if (payload.validUntil && new Date(payload.validUntil) < new Date()) {
            // Update status in DB
            const serviceClient = createClient(
                Deno.env.get('SUPABASE_URL')!,
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
            );
            await serviceClient
                .from('ee_licenses')
                .update({ status: 'expired' })
                .eq('license_key', licenseKey)
                .eq('status', 'active');

            return ok({
                valid: false,
                error: 'License has expired',
                expired_at: payload.validUntil,
            });
        }

        // Update validated_at timestamp
        const serviceClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        await serviceClient
            .from('ee_licenses')
            .update({ metadata: { validated_at: new Date().toISOString() } })
            .eq('license_key', licenseKey)
            .eq('status', 'active');

        return ok({
            valid: true,
            plan: payload.plan,
            seats: payload.seats,
            features: payload.features,
            validUntil: payload.validUntil,
            workspaceId: payload.workspaceId,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message.includes('authentication') || message.includes('Unauthorized')) {
            return unauthorized(message);
        }
        return serverError(message);
    }
});
