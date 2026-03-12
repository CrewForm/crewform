// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// stripe-portal — Creates a Stripe Customer Portal Session so users can
// manage payment methods, cancel, or switch plans.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { badRequest, unauthorized, serverError, methodNotAllowed } from '../_shared/response.ts';

import Stripe from 'https://esm.sh/stripe@14?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2024-04-10',
    httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req: Request) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;
    if (req.method !== 'POST') return methodNotAllowed();

    try {
        const auth = await authenticateRequest(req);

        // ── Get Stripe Customer ID ─────────────────────────────────────
        const serviceClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const { data: sub } = await serviceClient
            .from('subscriptions')
            .select('stripe_customer_id')
            .eq('workspace_id', auth.workspaceId)
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
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message.includes('authentication') || message.includes('JWT')) {
            return unauthorized(message);
        }
        return serverError(message);
    }
});
