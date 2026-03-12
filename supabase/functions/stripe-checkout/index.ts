// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// stripe-checkout — Creates a Stripe Checkout Session for plan upgrades.
// Returns a URL to redirect the user to Stripe's hosted checkout page.

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

const PRICE_MAP: Record<string, string | undefined> = {
    pro: Deno.env.get('STRIPE_PRO_PRICE_ID'),
    team: Deno.env.get('STRIPE_TEAM_PRICE_ID'),
};

serve(async (req: Request) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;
    if (req.method !== 'POST') return methodNotAllowed();

    try {
        const auth = await authenticateRequest(req);

        const body = await req.json() as { plan?: string };
        const plan = body.plan?.trim().toLowerCase();

        if (!plan || !PRICE_MAP[plan]) {
            return badRequest('Invalid plan. Must be "pro" or "team".');
        }

        const priceId = PRICE_MAP[plan]!;

        // ── Get or create Stripe Customer ──────────────────────────────
        const serviceClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const { data: sub } = await serviceClient
            .from('subscriptions')
            .select('stripe_customer_id')
            .eq('workspace_id', auth.workspaceId)
            .maybeSingle();

        let customerId = sub?.stripe_customer_id as string | null;

        // Look up user email from auth for Stripe customer
        const { data: { user: authUser } } = await serviceClient.auth.admin.getUserById(auth.userId);
        const userEmail = authUser?.email ?? undefined;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: userEmail,
                metadata: {
                    workspace_id: auth.workspaceId,
                    user_id: auth.userId,
                },
            });
            customerId = customer.id;

            // Store customer ID on subscription row
            await serviceClient
                .from('subscriptions')
                .update({ stripe_customer_id: customerId })
                .eq('workspace_id', auth.workspaceId);
        }

        // ── Create Checkout Session ────────────────────────────────────
        const origin = req.headers.get('origin') ?? 'https://crewform.tech';

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${origin}/settings?tab=billing&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/settings?tab=billing`,
            subscription_data: {
                metadata: {
                    workspace_id: auth.workspaceId,
                },
            },
            metadata: {
                workspace_id: auth.workspaceId,
            },
            allow_promotion_codes: true,
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
