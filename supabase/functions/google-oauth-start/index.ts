// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Google OAuth Start — initiates the Google OAuth 2.0 flow.
 *
 * Returns a redirect URL to Google's consent screen.
 * The state parameter encodes workspace_id for the callback.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { badRequest, forbidden, ok, serverError, methodNotAllowed } from '../_shared/response.ts';
import { sha256Hex } from '../_shared/encryption.ts';

const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

Deno.serve(async (req: Request) => {
    const cors = handleCors(req);
    if (cors) return cors;

    if (req.method !== 'POST') {
        return methodNotAllowed();
    }

    try {
        const auth = await authenticateRequest(req);
        const body = await req.json() as { workspace_id?: string };
        if (!body.workspace_id) return badRequest('workspace_id is required');
        const { data: membership } = await auth.supabaseClient.from('workspace_members').select('role')
            .eq('workspace_id', body.workspace_id).eq('user_id', auth.userId).single();
        if (!membership || !['owner', 'admin'].includes((membership as { role: string }).role)) {
            return forbidden('Workspace owner or admin access required');
        }

        const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!clientId || !supabaseUrl) {
            return serverError('Google OAuth is not configured. Set GOOGLE_CLIENT_ID env var.');
        }

        const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;
        const state = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
        const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const { error: stateError } = await service.from('oauth_states').insert({
            state_hash: await sha256Hex(state),
            workspace_id: body.workspace_id,
            user_id: auth.userId,
            provider: 'google',
            expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        });
        if (stateError) return serverError('Unable to initiate OAuth flow');

        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: GOOGLE_SCOPES,
            access_type: 'offline',
            prompt: 'consent',
            state,
        });

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

        return ok({ auth_url: authUrl });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return serverError(message);
    }
});
