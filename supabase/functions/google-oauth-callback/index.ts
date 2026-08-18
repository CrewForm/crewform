// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Google OAuth Callback — handles the redirect from Google.
 *
 * Exchanges the authorization code for tokens, stores them in
 * google_connections, and redirects the user back to CrewForm settings.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { encryptSecret, sha256Hex } from '../_shared/encryption.ts';

Deno.serve(async (req: Request) => {
    // This is a GET redirect from Google — no CORS preflight needed
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    const appUrl = Deno.env.get('APP_URL') ?? 'https://app.crewform.tech';
    const settingsUrl = `${appUrl}/settings/webhooks`;

    // ── Handle errors from Google ─────────────────────────────────────
    if (error) {
        return Response.redirect(`${settingsUrl}?google_error=${encodeURIComponent(error)}`, 302);
    }

    if (!code || !state) {
        return Response.redirect(`${settingsUrl}?google_error=missing_params`, 302);
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

        // Consume the opaque state once, before exchanging the authorization code.
        const { data: stateRow, error: stateError } = await serviceClient
            .from('oauth_states')
            .delete()
            .eq('state_hash', await sha256Hex(state))
            .eq('provider', 'google')
            .gt('expires_at', new Date().toISOString())
            .select('workspace_id')
            .single();
        const workspaceId = (stateRow as { workspace_id?: string } | null)?.workspace_id;
        if (stateError || !workspaceId) {
            return Response.redirect(`${settingsUrl}?google_error=invalid_state`, 302);
        }

        // ── Exchange code for tokens ───────────────────────────────────
        const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
        const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
        const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;

        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        });

        if (!tokenResp.ok) {
            const errBody = await tokenResp.text();
            console.error('[Google OAuth] Token exchange failed:', errBody);
            return Response.redirect(`${settingsUrl}?google_error=token_exchange_failed`, 302);
        }

        const tokens = await tokenResp.json() as {
            access_token: string;
            refresh_token?: string;
            expires_in: number;
            scope: string;
        };

        if (!tokens.refresh_token) {
            console.error('[Google OAuth] No refresh_token returned — user may have already connected before');
            return Response.redirect(`${settingsUrl}?google_error=no_refresh_token`, 302);
        }

        // ── Fetch user email for display ──────────────────────────────
        let googleEmail: string | null = null;
        try {
            const userInfoResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
            });
            if (userInfoResp.ok) {
                const userInfo = await userInfoResp.json() as { email?: string };
                googleEmail = userInfo.email ?? null;
            }
        } catch {
            // Non-fatal — we just won't have the email for display
        }

        // ── Store in google_connections ────────────────────────────────
        const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
        const scopes = tokens.scope.split(' ');

        const { error: upsertError } = await serviceClient
            .from('google_connections')
            .upsert({
                workspace_id: workspaceId,
                access_token: await encryptSecret(tokens.access_token),
                refresh_token: await encryptSecret(tokens.refresh_token),
                token_expiry: tokenExpiry,
                scopes,
                google_email: googleEmail,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'workspace_id' });

        if (upsertError) {
            console.error('[Google OAuth] Upsert error:', upsertError.message);
            return Response.redirect(`${settingsUrl}?google_error=storage_failed`, 302);
        }

        // ── Redirect back to app with success ─────────────────────────
        const successEmail = googleEmail ? `&google_email=${encodeURIComponent(googleEmail)}` : '';
        return Response.redirect(`${settingsUrl}?google_connected=true${successEmail}`, 302);

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Google OAuth] Callback error:', message);
        return Response.redirect(`${settingsUrl}?google_error=unexpected`, 302);
    }
});
