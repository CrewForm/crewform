// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { encryptSecret, isEncryptedSecret } from '../_shared/encryption.ts';
import { badRequest, forbidden, methodNotAllowed, ok, serverError, unauthorized } from '../_shared/response.ts';

Deno.serve(async (req: Request) => {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'POST') return methodNotAllowed();

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return unauthorized('Unauthorized');
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) return unauthorized('Unauthorized');

        const body = await req.json() as { workspace_id?: string; action?: 'status' | 'delete' };
        if (!body.workspace_id || !body.action) return badRequest('workspace_id and action are required');
        const { data: membership } = await userClient.from('workspace_members').select('role')
            .eq('workspace_id', body.workspace_id).eq('user_id', user.id).single();
        if (!membership || !['owner', 'admin'].includes((membership as { role: string }).role)) {
            return forbidden('Workspace owner or admin access required');
        }

        const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        if (body.action === 'delete') {
            const { error } = await service.from('google_connections').delete().eq('workspace_id', body.workspace_id);
            if (error) return serverError(error.message);
            return ok({ deleted: true });
        }

        const { data, error } = await service.from('google_connections').select('*')
            .eq('workspace_id', body.workspace_id).maybeSingle();
        if (error) return serverError(error.message);
        if (!data) return ok(null);
        if (!isEncryptedSecret(data.access_token as string) || !isEncryptedSecret(data.refresh_token as string)) {
            const { error: migrationError } = await service.from('google_connections').update({
                access_token: await encryptSecret(data.access_token as string),
                refresh_token: await encryptSecret(data.refresh_token as string),
            }).eq('id', data.id as string);
            if (migrationError) return serverError(migrationError.message);
        }
        const { access_token: _access, refresh_token: _refresh, ...metadata } = data;
        return ok(metadata);
    } catch (error) {
        return serverError(error instanceof Error ? error.message : String(error));
    }
});
