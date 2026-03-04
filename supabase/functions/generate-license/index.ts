// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// generate-license — Admin-only Edge Function to create EE license keys.
// Called from the License Admin panel in Settings.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { created, badRequest, unauthorized, serverError, methodNotAllowed } from '../_shared/response.ts';

// ─── HMAC-SHA256 signing ─────────────────────────────────────────────────────

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

// ─── Base64url helpers (Deno-compatible) ─────────────────────────────────────

function toBase64url(str: string): string {
    const b64 = btoa(str);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;
    if (req.method !== 'POST') return methodNotAllowed();

    try {
        // Authenticate caller
        const auth = await authenticateRequest(req);

        // Verify caller is workspace owner (admin check)
        const serviceClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const { data: workspace } = await serviceClient
            .from('workspaces')
            .select('owner_id')
            .eq('id', auth.workspaceId)
            .single();

        if (!workspace || (workspace as { owner_id: string }).owner_id !== auth.userId) {
            return unauthorized('Only workspace owners can generate licenses');
        }

        // Parse request body
        const body = await req.json() as {
            workspaceId?: string;
            plan?: string;
            features?: string[];
            seats?: number;
            validUntil?: string | null;
        };

        const targetWorkspaceId = body.workspaceId || auth.workspaceId;
        const plan = body.plan || 'enterprise';
        const features = body.features || [];
        const seats = body.seats || 5;
        const validUntil = body.validUntil || null;

        if (!features.length) {
            return badRequest('At least one feature must be specified');
        }

        // Get signing secret
        const secret = Deno.env.get('CREWFORM_LICENSE_SECRET');
        if (!secret) {
            return serverError('License signing not configured');
        }

        // Build and sign the license key
        const payload = JSON.stringify({
            plan,
            workspaceId: targetWorkspaceId,
            seats,
            features,
            validUntil,
        });

        const payloadB64 = toBase64url(payload);
        const signature = await hmacSign(payloadB64, secret);
        const licenseKey = `CF-${plan}-${payloadB64}-${signature}`;

        // Deactivate any existing active license for this workspace
        await serviceClient
            .from('ee_licenses')
            .update({ status: 'replaced' })
            .eq('workspace_id', targetWorkspaceId)
            .eq('status', 'active');

        // Insert the new license
        const { data: license, error: insertError } = await serviceClient
            .from('ee_licenses')
            .insert({
                workspace_id: targetWorkspaceId,
                license_key: licenseKey,
                plan,
                features,
                seats,
                valid_from: new Date().toISOString(),
                valid_until: validUntil,
                status: 'active',
                metadata: { generated_by: auth.userId },
            })
            .select('id, plan, features, seats, valid_from, valid_until, status')
            .single();

        if (insertError) {
            return serverError(`Failed to store license: ${insertError.message}`);
        }

        return created({
            license_key: licenseKey,
            license,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message.includes('authentication') || message.includes('JWT') || message.includes('Unauthorized')) {
            return unauthorized(message);
        }
        return serverError(message);
    }
});
