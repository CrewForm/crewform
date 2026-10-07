// SPDX-License-Identifier: AGPL-3.0-or-later
import { PLAN_CATALOGUE } from '../_shared/planCatalogue.ts';
import { readJson } from '../_shared/body.ts';
// Copyright (C) 2026 CrewForm
//
// stripe-checkout — Creates a Stripe Checkout Session for plan upgrades.
// Returns a URL to redirect the user to Stripe's hosted checkout page.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { badRequest, forbidden, unauthorized, serverError, methodNotAllowed } from '../_shared/response.ts';

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

        // An explicit workspace and billing role are required before contacting Stripe.
        const body = await readJson(req);
        const workspaceId = body.workspace_id;
        if (typeof workspaceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(workspaceId)) return badRequest('workspace_id is required');
        const { data: membership, error: memberError } = await userClient
            .from('workspace_members')
            .select('workspace_id, role')
            .eq('user_id', user.id)
            .eq('workspace_id', workspaceId)
            .single();

        if (memberError || !membership) {
            return unauthorized('User is not a member of any workspace');
        }

        if (!['owner', 'admin'].includes((membership as { role: string }).role)) return forbidden('Billing requires owner or admin access');

        // ── Parse request ──────────────────────────────────────────────
        const plan = typeof body.plan === 'string' ? body.plan.trim().toLowerCase() : undefined;

        if (!plan || !PRICE_MAP[plan]) {
            return badRequest('Invalid plan. Must be "pro" or "team".');
        }

        const priceId = PRICE_MAP[plan]!;
        const price = await stripe.prices.retrieve(priceId);
        if (!price.active || price.currency !== 'usd' || price.unit_amount !== PLAN_CATALOGUE.plans[plan as 'pro' | 'team'].monthlyUsd * 100 || price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1) {
            return serverError('Stripe pricing configuration does not match the published monthly plan');
        }

        // ── Service client for DB writes ───────────────────────────────
        const serviceClient = createClient(
            supabaseUrl,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        // ── Get or create Stripe Customer ──────────────────────────────
        const { data: sub, error: subError } = await serviceClient
            .from('subscriptions')
            .select('stripe_customer_id, stripe_subscription_id')
            .eq('workspace_id', workspaceId)
            .maybeSingle();

        if (subError) throw new Error(subError.message);
        if (sub?.stripe_subscription_id) return badRequest('Manage an existing subscription through the billing portal');
        let customerId = sub?.stripe_customer_id as string | null;

        // Verify the stored customer still exists in Stripe (handles live→test mode switch)
        if (customerId) {
            try {
                await stripe.customers.retrieve(customerId);
            } catch (error) {
                if (!(error instanceof Stripe.errors.StripeInvalidRequestError) || (error as {code?:string}).code !== 'resource_missing') throw error;
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
            }, { idempotencyKey: `crewform-customer-${workspaceId}` });
            customerId = customer.id;

            // Store customer ID on subscription row
            const stored = await serviceClient
                .from('subscriptions')
                .upsert({
                    workspace_id: workspaceId,
                    stripe_customer_id: customerId,
                }, { onConflict: 'workspace_id' });
            if (stored.error) throw new Error(stored.error.message);
        }

        const existingSubscriptions = await stripe.subscriptions.list({customer: customerId,status:'all',limit:100});
        if (existingSubscriptions.data.some((subscription: {metadata?:Record<string,string>;status:string}) => subscription.metadata?.workspace_id===workspaceId && !['canceled','incomplete_expired'].includes(subscription.status))) return badRequest('Manage your existing subscription through the billing portal');
        const reservation = await serviceClient.rpc('reserve_billing_checkout', {p_workspace_id: workspaceId,p_plan:plan});
        if (reservation.error) throw new Error(reservation.error.message);
        const checkout = reservation.data?.[0];
        if (!checkout) throw new Error('Checkout reservation unavailable');
        if (checkout.url) return new Response(JSON.stringify({url:checkout.url}),{status:200,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});

        // ── Create Checkout Session ────────────────────────────────────
        const origin = (Deno.env.get('APP_URL') ?? 'https://app.crewform.tech').replace(/\/$/, '');

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
            expires_at: Math.floor(Date.now()/1000)+1800,
        }, {idempotencyKey: `crewform-checkout-${checkout.token}`});
        const bound = await serviceClient.rpc('bind_billing_checkout', {p_workspace_id:workspaceId,p_token:checkout.token,p_session_id:session.id,p_url:session.url,p_expires_at:new Date(session.expires_at*1000).toISOString()});
        if (bound.error) throw new Error(bound.error.message);

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
