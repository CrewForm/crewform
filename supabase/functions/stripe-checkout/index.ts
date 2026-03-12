// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// stripe-checkout — Creates a Stripe Checkout Session for plan upgrades.
// Returns a URL to redirect the user to Stripe's hosted checkout page.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { badRequest, unauthorized, serverError, methodNotAllowed } from '../_shared/response.ts';

import Stripe from 'https://esm.sh/stripe@14?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2024-04-10',
    httpClient: Stripe.createFetchHttpClient(),
});

const PRICE_MAP: Record<string, string | undefined> = {
    pro: Deno.env.get('STRIPE_PRO_PRICE_ID')?.trim(),
    team: Deno.env.get('STRIPE_TEAM_PRICE_ID')?.trim(),
};

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

        // ── Parse request ──────────────────────────────────────────────
        const body = await req.json() as { plan?: string };
        const plan = body.plan?.trim().toLowerCase();

        if (!plan || !PRICE_MAP[plan]) {
            return badRequest('Invalid plan. Must be "pro" or "team".');
        }

        const priceId = PRICE_MAP[plan]!;

        // ── Service client for DB writes ───────────────────────────────
        const serviceClient = createClient(
            supabaseUrl,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        // ── Get or create Stripe Customer ──────────────────────────────
        const { data: sub } = await serviceClient
            .from('subscriptions')
            .select('stripe_customer_id')
            .eq('workspace_id', workspaceId)
            .maybeSingle();

        let customerId = sub?.stripe_customer_id as string | null;

        // Verify the stored customer still exists in Stripe (handles live→test mode switch)
        if (customerId) {
            try {
                await stripe.customers.retrieve(customerId);
            } catch {
                console.warn(`[stripe-checkout] Stored customer ${customerId} not found in Stripe, creating new one`);
                customerId = null;
            }
        }

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email ?? undefined,
                metadata: {
                    workspace_id: workspaceId,
                    user_id: user.id,
                },
            });
            customerId = customer.id;

            // Store customer ID on subscription row
            await serviceClient
                .from('subscriptions')
                .upsert({
                    workspace_id: workspaceId,
                    stripe_customer_id: customerId,
                    plan: 'free',
                    status: 'active',
                }, { onConflict: 'workspace_id' });
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
                    workspace_id: workspaceId,
                },
            },
            metadata: {
                workspace_id: workspaceId,
            },
            allow_promotion_codes: true,
        });

        return new Response(
            JSON.stringify({ url: session.url }),
            { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[stripe-checkout] Error:', message);
        return serverError(message);
    }
});
