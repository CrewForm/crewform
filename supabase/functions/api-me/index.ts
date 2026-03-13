// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * API Me — Auth test / identity endpoint.
 *
 * Zapier calls this to verify the API key is valid and to display
 * the connected account name in the Zapier UI.
 *
 * Auth: X-API-Key header or JWT Bearer token
 */

import { handleCors } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { ok, unauthorized, methodNotAllowed, serverError } from '../_shared/response.ts';
import { checkRateLimit, tooManyRequests } from '../_shared/rateLimit.ts';

Deno.serve(async (req: Request) => {
    const cors = handleCors(req);
    if (cors) return cors;

    if (req.method !== 'GET') {
        return methodNotAllowed();
    }

    try {
        const auth = await authenticateRequest(req);

        // Rate limiting
        const rl = await checkRateLimit(auth.workspaceId, auth.plan, auth.apiKeyRateLimit);
        if (!rl.allowed) return tooManyRequests(rl, auth.apiVersion);
        const resOpts = { apiVersion: auth.apiVersion, rateLimit: rl };

        // Fetch workspace name for display
        const { data: workspace } = await auth.supabaseClient
            .from('workspaces')
            .select('name')
            .eq('id', auth.workspaceId)
            .single();

        const workspaceName = workspace ? (workspace as { name: string }).name : 'Unknown';

        // Fetch user email for display
        const { data: profile } = await auth.supabaseClient
            .from('profiles')
            .select('email, full_name')
            .eq('id', auth.userId)
            .single();

        const profileData = profile as { email?: string; full_name?: string } | null;

        return ok({
            id: auth.userId,
            email: profileData?.email ?? null,
            name: profileData?.full_name ?? null,
            workspace_id: auth.workspaceId,
            workspace_name: workspaceName,
            plan: auth.plan,
            api_version: auth.apiVersion,
        }, resOpts);

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('authentication') || message.includes('JWT') || message.includes('API key') || message.includes('Invalid')) {
            return unauthorized(message);
        }
        return serverError(message);
    }
});
