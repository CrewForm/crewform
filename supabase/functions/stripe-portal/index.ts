// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// stripe-portal — Creates a Stripe Customer Portal Session so users can
// manage payment methods, cancel, or switch plans.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { badRequest, unauthorized, serverError, methodNotAllowed } from '../_shared/response.ts';

import Stripe from 'https://esm.sh/stripe@14?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2024-04-10',
    httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req: Request) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;
    if (req.method !== 'POST') return methodNotAllowed();

    try {
        // ── Authenticate via Supabase JWT ───────────────────────────────
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return unauthorized('Missing Authorization header');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) {
            return unauthorized('Invalid or expired token');
        }

        // Get workspace
        const { data: membership, error: memberError } = await userClient
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .limit(1)
            .single();

        if (memberError || !membership) {
            return unauthorized('User is not a member of any workspace');
        }

        const workspaceId = (membership as { workspace_id: string }).workspace_id;

        // ── Get Stripe Customer ID ─────────────────────────────────────
        const serviceClient = createClient(
            supabaseUrl,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const { data: sub } = await serviceClient
            .from('subscriptions')
            .select('stripe_customer_id')
            .eq('workspace_id', workspaceId)
            .maybeSingle();

        const customerId = sub?.stripe_customer_id as string | null;

        if (!customerId) {
            return badRequest('No billing account found. Please upgrade first.');
        }

        // ── Create Portal Session ──────────────────────────────────────
        const origin = req.headers.get('origin') ?? 'https://crewform.tech';

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${origin}/settings?tab=billing`,
        });

        return new Response(
            JSON.stringify({ url: session.url }),
            { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[stripe-portal] Error:', message);
        return serverError(message);
    }
});
