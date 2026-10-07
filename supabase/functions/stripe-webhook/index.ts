// SPDX-License-Identifier: AGPL-3.0-or-later
import { readText } from '../_shared/body.ts';
// Copyright (C) 2026 CrewForm
//
// stripe-webhook — Handles incoming Stripe webhook events.
// Syncs subscription state to the subscriptions table.
// The DB trigger (047_stripe_sync.sql) then auto-syncs to ee_licenses.

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

const PRO_PRICE = Deno.env.get('STRIPE_PRO_PRICE_ID')?.trim();
const TEAM_PRICE = Deno.env.get('STRIPE_TEAM_PRICE_ID')?.trim();

function resolvePlan(priceId: string): string {
    if (priceId === PRO_PRICE || (Deno.env.get('STRIPE_PRO_LEGACY_PRICE_IDS') ?? '').split(',').map(id => id.trim()).includes(priceId)) return 'pro';
    if (priceId === TEAM_PRICE || (Deno.env.get('STRIPE_TEAM_LEGACY_PRICE_IDS') ?? '').split(',').map(id => id.trim()).includes(priceId)) return 'team';
    throw new Error('Unrecognized Stripe price; configure legacy price IDs explicitly');
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
        default: throw new Error('Unsupported Stripe subscription status');
    }
}

/** Extract period dates from subscription — handles both top-level and item-level fields */
function extractPeriodDates(sub: Record<string, unknown>): { start: string | null; end: string | null } {
    // Try top-level first (older API versions), then fall back to item-level
    const item = (sub as { items?: { data?: Array<{ current_period_start?: number; current_period_end?: number }> } })
        .items?.data?.[0];

    const startTs = (sub as { current_period_start?: number }).current_period_start
        ?? item?.current_period_start;
    const endTs = (sub as { current_period_end?: number }).current_period_end
        ?? item?.current_period_end;

    return {
        start: startTs ? new Date(startTs * 1000).toISOString() : null,
        end: endTs ? new Date(endTs * 1000).toISOString() : null,
    };
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    // Only accept POST
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    // ── Verify webhook signature ───────────────────────────────────────
    const body = await readText(req);
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
        let subscriptionId: string | null = null;
        const replacement = event.type === 'checkout.session.completed';
        if (replacement) subscriptionId = (event.data.object as Stripe.Checkout.Session).subscription as string | null;
        else if (event.type.startsWith('customer.subscription.')) subscriptionId = (event.data.object as Stripe.Subscription).id;
        else if (['invoice.payment_failed', 'invoice.paid'].includes(event.type)) subscriptionId = (event.data.object as Stripe.Invoice).subscription as string | null;
        if (subscriptionId) {
            // Signed events are notifications. Reconcile against current Stripe state.
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const workspaceId = subscription.metadata?.workspace_id;
            if (!workspaceId) throw new Error('Subscription workspace metadata missing');
            const status = mapStripeStatus(subscription.status);
            const plan = status === 'cancelled' ? 'free' : resolvePlan(subscription.items.data[0]?.price.id ?? '');
            const period = extractPeriodDates(subscription as unknown as Record<string, unknown>);
            const {error} = await supabase.rpc('apply_stripe_entitlement', {
                p_event_id: event.id, p_event_created: event.created, p_workspace_id: workspaceId,
                p_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
                p_subscription_id: subscription.id, p_plan: plan, p_status: status,
                p_period_start: period.start, p_period_end: period.end,
                p_cancel_at_period_end: subscription.cancel_at_period_end, p_replacement: replacement,
            });
            if (error) throw new Error(error.message);
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
