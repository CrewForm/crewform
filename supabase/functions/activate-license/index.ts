// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// activate-license — Edge Function for self-hosted customers to activate
// a pre-signed license key. Validates the HMAC signature and stores it.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { created, badRequest, unauthorized, serverError, methodNotAllowed } from '../_shared/response.ts';

// ─── HMAC verification ──────────────────────────────────────────────────────

async function hmacVerify(payload: string, signature: string, secret: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const expectedHex = Array.from(new Uint8Array(expected))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return signature === expectedHex;
}

function fromBase64url(str: string): string {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return atob(b64);
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;
    if (req.method !== 'POST') return methodNotAllowed();

    try {
        const auth = await authenticateRequest(req);

        const body = await req.json() as { licenseKey?: string };
        const licenseKey = body.licenseKey?.trim();

        if (!licenseKey) {
            return badRequest('licenseKey is required');
        }

        // Parse key format: CF-{plan}-{base64Payload}-{signature}
        const parts = licenseKey.split('-');
        if (parts.length < 4 || parts[0] !== 'CF') {
            return badRequest('Invalid license key format');
        }

        const plan = parts[1];
        const payloadB64 = parts.slice(2, -1).join('-');
        const signature = parts[parts.length - 1];

        // Verify HMAC signature
        const secret = Deno.env.get('CREWFORM_LICENSE_SECRET');
        if (!secret) {
            return serverError('License validation not configured');
        }

        const valid = await hmacVerify(payloadB64, signature, secret);
        if (!valid) {
            return badRequest('Invalid license key — signature verification failed');
        }

        // Decode payload
        let payload: {
            plan: string;
            workspaceId: string;
            seats: number;
            features: string[];
            validUntil: string | null;
        };
        try {
            payload = JSON.parse(fromBase64url(payloadB64));
        } catch {
            return badRequest('Corrupted license key');
        }

        // Verify plan matches
        if (payload.plan !== plan) {
            return badRequest('License key plan mismatch');
        }

        // Check expiry
        if (payload.validUntil && new Date(payload.validUntil) < new Date()) {
            return badRequest('This license key has expired');
        }

        // Store the license
        const serviceClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        // Deactivate any existing license
        await serviceClient
            .from('ee_licenses')
            .update({ status: 'replaced' })
            .eq('workspace_id', auth.workspaceId)
            .eq('status', 'active');

        // Insert the new one
        const { data: license, error: insertError } = await serviceClient
            .from('ee_licenses')
            .insert({
                workspace_id: auth.workspaceId,
                license_key: licenseKey,
                plan: payload.plan,
                features: payload.features,
                seats: payload.seats,
                valid_from: new Date().toISOString(),
                valid_until: payload.validUntil,
                status: 'active',
                metadata: { activated_by: auth.userId },
            })
            .select('id, plan, features, seats, valid_from, valid_until, status')
            .single();

        if (insertError) {
            return serverError(`Failed to activate license: ${insertError.message}`);
        }

        return created({
            activated: true,
            license,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message.includes('authentication') || message.includes('JWT')) {
            return unauthorized(message);
        }
        return serverError(message);
    }
});
