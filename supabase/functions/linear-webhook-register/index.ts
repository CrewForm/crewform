// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Linear Webhook Register — Creates a Linear webhook via GraphQL API.
 *
 * Called from the frontend when setting up a Linear messaging channel.
 * Creates a webhook subscription on the specified Linear team pointing
 * to the channel-linear Edge Function.
 */

import { corsHeaders } from '../_shared/cors.ts';

interface RegisterRequest {
    api_key: string;
    team_id: string;
    label?: string;
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        // Verify caller is authenticated
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const body = (await req.json()) as RegisterRequest;
        const { api_key, team_id, label } = body;

        if (!api_key || !team_id) {
            return new Response(JSON.stringify({ error: 'api_key and team_id are required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const callbackUrl = `${supabaseUrl}/functions/v1/channel-linear`;

        // Create webhook via Linear GraphQL API
        const mutation = `
            mutation WebhookCreate($input: WebhookCreateInput!) {
                webhookCreate(input: $input) {
                    success
                    webhook {
                        id
                        enabled
                        url
                        secret
                    }
                }
            }
        `;

        const variables = {
            input: {
                url: callbackUrl,
                teamId: team_id,
                label: label ?? 'CrewForm',
                resourceTypes: ['Issue'],
                enabled: true,
            },
        };

        const resp = await fetch('https://api.linear.app/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: api_key,
            },
            body: JSON.stringify({ query: mutation, variables }),
        });

        const result = await resp.json();

        if (result.errors) {
            const errorMsg = result.errors.map((e: { message: string }) => e.message).join(', ');
            console.error('[linear-webhook-register] GraphQL errors:', errorMsg);
            return new Response(JSON.stringify({ error: errorMsg }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const webhookData = result.data?.webhookCreate;
        if (!webhookData?.success) {
            return new Response(JSON.stringify({ error: 'Failed to create webhook' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Also fetch available workflow states for the team (for trigger config)
        let states: Array<{ id: string; name: string; type: string }> = [];
        try {
            const statesQuery = `
                query TeamStates($teamId: String!) {
                    team(id: $teamId) {
                        states {
                            nodes {
                                id
                                name
                                type
                            }
                        }
                    }
                }
            `;

            const statesResp = await fetch('https://api.linear.app/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: api_key,
                },
                body: JSON.stringify({ query: statesQuery, variables: { teamId: team_id } }),
            });

            const statesResult = await statesResp.json();
            states = statesResult.data?.team?.states?.nodes ?? [];
        } catch {
            console.warn('[linear-webhook-register] Failed to fetch team states');
        }

        return new Response(JSON.stringify({
            webhook_id: webhookData.webhook.id,
            webhook_secret: webhookData.webhook.secret,
            callback_url: callbackUrl,
            team_states: states,
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[linear-webhook-register] Error:', message);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
