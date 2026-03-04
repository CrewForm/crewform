// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// revoke-license — Admin-only Edge Function to deactivate an EE license.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { ok, badRequest, unauthorized, serverError, methodNotAllowed } from '../_shared/response.ts';

serve(async (req: Request) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;
    if (req.method !== 'POST') return methodNotAllowed();

    try {
        const auth = await authenticateRequest(req);

        // Verify caller is workspace owner
        const serviceClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const { data: workspace } = await serviceClient
            .from('workspaces')
            .select('owner_id')
            .eq('id', auth.workspaceId)
            .single();

        if (!workspace || (workspace as { owner_id: string }).owner_id !== auth.userId) {
            return unauthorized('Only workspace owners can revoke licenses');
        }

        const body = await req.json() as { licenseId?: string };

        if (!body.licenseId) {
            return badRequest('licenseId is required');
        }

        // Revoke the license
        const { data: revoked, error } = await serviceClient
            .from('ee_licenses')
            .update({ status: 'revoked' })
            .eq('id', body.licenseId)
            .eq('workspace_id', auth.workspaceId)
            .eq('status', 'active')
            .select('id, status')
            .single();

        if (error || !revoked) {
            return badRequest('License not found or already revoked');
        }

        return ok({ revoked: true, license: revoked });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message.includes('authentication') || message.includes('JWT')) {
            return unauthorized(message);
        }
        return serverError(message);
    }
});
