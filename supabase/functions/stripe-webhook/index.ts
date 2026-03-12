// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// stripe-webhook — Handles incoming Stripe webhook events.
// Syncs subscription state to the subscriptions table.
// The DB trigger (047_stripe_sync.sql) then auto-syncs to ee_licenses.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import Stripe from 'https://esm.sh/stripe@14?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2024-04-10',
    httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// ─── Plan resolver ──────────────────────────────────────────────────────────

const PRO_PRICE = Deno.env.get('STRIPE_PRO_PRICE_ID');
const TEAM_PRICE = Deno.env.get('STRIPE_TEAM_PRICE_ID');

function resolvePlan(priceId: string): string {
    if (priceId === PRO_PRICE) return 'pro';
    if (priceId === TEAM_PRICE) return 'team';
    return 'pro'; // fallback
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapStripeStatus(status: string): string {
    switch (status) {
        case 'active': return 'active';
        case 'past_due': return 'past_due';
        case 'canceled': return 'cancelled';
        case 'trialing': return 'trialing';
        case 'incomplete': return 'incomplete';
        case 'incomplete_expired': return 'cancelled';
        case 'unpaid': return 'past_due';
        default: return 'active';
    }
}

// ─── Handler ────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
    // Only accept POST
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    // ── Verify webhook signature ───────────────────────────────────────
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    if (!sig) {
        return new Response('Missing stripe-signature header', { status: 400 });
    }

    let event: Stripe.Event;
    try {
        event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown';
        console.error('[stripe-webhook] Signature verification failed:', message);
        return new Response(`Webhook signature verification failed: ${message}`, { status: 400 });
    }

    console.log(`[stripe-webhook] Received event: ${event.type} (${event.id})`);

    // ── Handle events ──────────────────────────────────────────────────

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                const workspaceId = session.metadata?.workspace_id;
                const subscriptionId = session.subscription as string;

                if (!workspaceId || !subscriptionId) {
                    console.warn('[stripe-webhook] checkout.session.completed missing workspace_id or subscription');
                    break;
                }

                // Fetch the full subscription to get price/plan info
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                const priceId = subscription.items.data[0]?.price.id ?? '';
                const plan = resolvePlan(priceId);

                await supabase
                    .from('subscriptions')
                    .update({
                        stripe_customer_id: session.customer as string,
                        stripe_subscription_id: subscriptionId,
                        plan,
                        status: 'active',
                        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
                        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                        cancel_at_period_end: subscription.cancel_at_period_end,
                    })
                    .eq('workspace_id', workspaceId);

                console.log(`[stripe-webhook] Workspace ${workspaceId} upgraded to ${plan}`);
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object as Stripe.Subscription;
                const workspaceId = subscription.metadata?.workspace_id;

                if (!workspaceId) {
                    console.warn('[stripe-webhook] subscription.updated missing workspace_id in metadata');
                    break;
                }

                const priceId = subscription.items.data[0]?.price.id ?? '';
                const plan = resolvePlan(priceId);
                const status = mapStripeStatus(subscription.status);

                await supabase
                    .from('subscriptions')
                    .update({
                        plan,
                        status,
                        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
                        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                        cancel_at_period_end: subscription.cancel_at_period_end,
                    })
                    .eq('workspace_id', workspaceId);

                console.log(`[stripe-webhook] Workspace ${workspaceId} subscription updated: ${plan} (${status})`);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                const workspaceId = subscription.metadata?.workspace_id;

                if (!workspaceId) {
                    console.warn('[stripe-webhook] subscription.deleted missing workspace_id in metadata');
                    break;
                }

                // Revert to free plan
                await supabase
                    .from('subscriptions')
                    .update({
                        plan: 'free',
                        status: 'cancelled',
                        stripe_subscription_id: null,
                        cancel_at_period_end: false,
                        current_period_start: null,
                        current_period_end: null,
                    })
                    .eq('workspace_id', workspaceId);

                console.log(`[stripe-webhook] Workspace ${workspaceId} subscription deleted → free`);
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice;
                const subscriptionId = invoice.subscription as string | null;

                if (!subscriptionId) break;

                // Look up by stripe_subscription_id
                await supabase
                    .from('subscriptions')
                    .update({ status: 'past_due' })
                    .eq('stripe_subscription_id', subscriptionId);

                console.log(`[stripe-webhook] Payment failed for subscription ${subscriptionId}`);
                break;
            }

            default:
                console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
        }
    } catch (err) {
        console.error(`[stripe-webhook] Error handling ${event.type}:`, err);
        return new Response('Webhook handler error', { status: 500 });
    }

    return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
});
