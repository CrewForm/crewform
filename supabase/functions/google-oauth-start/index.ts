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
import { ok, badRequest, serverError, methodNotAllowed } from '../_shared/response.ts';

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

        const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!clientId || !supabaseUrl) {
            return serverError('Google OAuth is not configured. Set GOOGLE_CLIENT_ID env var.');
        }

        const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;

        // Encode workspace_id in state (base64 of JSON)
        const stateData = {
            workspace_id: auth.workspaceId,
            nonce: crypto.randomUUID(),
        };
        const state = btoa(JSON.stringify(stateData));

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
