// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { encryptSecret, isEncryptedSecret, sha256Hex } from '../_shared/encryption.ts';
import { badRequest, forbidden, methodNotAllowed, ok, serverError, unauthorized } from '../_shared/response.ts';
import { assertSafeProviderUrl } from '../_shared/urlSafety.ts';

type Action = 'list' | 'save' | 'toggle' | 'delete' | 'generate_auth_key';

interface RequestBody {
    action: Action;
    workspace_id: string;
    id?: string;
    provider?: string;
    raw_key?: string;
    is_active?: boolean;
    base_url?: string | null;
}

const AUTH_PROVIDERS = new Set(['mcp-server', 'a2a', 'ag-ui']);

Deno.serve(async (req: Request) => {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'POST') return methodNotAllowed();

    try {
        const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
        if (!token) return unauthorized('Unauthorized');

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) return unauthorized('Unauthorized');

        const body = await req.json() as RequestBody;
        if (!body.workspace_id || !body.action) return badRequest('workspace_id and action are required');

        const { data: membership } = await userClient
            .from('workspace_members')
            .select('role')
            .eq('workspace_id', body.workspace_id)
            .eq('user_id', user.id)
            .single();
        if (!membership) return forbidden();

        const role = (membership as { role: string }).role;
        const canManage = role === 'owner' || role === 'admin';
        const service = createClient(supabaseUrl, serviceKey);

        if (body.action === 'list') {
            const { data, error } = await service
                .from('api_keys')
                .select('id, workspace_id, provider, key_hint, is_valid, is_active, base_url, created_at, updated_at, encrypted_key')
                .eq('workspace_id', body.workspace_id)
                .order('provider');
            if (error) return serverError(error.message);

            // Transparently encrypt legacy plaintext values without returning them.
            if (canManage) {
                await Promise.all((data ?? []).map(async row => {
                    if (!isEncryptedSecret(row.encrypted_key as string)) {
                        await service.from('api_keys').update({
                            encrypted_key: await encryptSecret(row.encrypted_key as string),
                        }).eq('id', row.id as string).eq('workspace_id', body.workspace_id);
                    }
                }));
            }
            return ok((data ?? []).map(({ encrypted_key: _secret, ...metadata }) => metadata));
        }

        if (!canManage) return forbidden('Workspace owner or admin access required');

        if (body.action === 'save') {
            if (!body.provider || !body.raw_key) return badRequest('provider and raw_key are required');
            if (body.base_url) await assertSafeProviderUrl(body.base_url);
            const encrypted = await encryptSecret(body.raw_key);
            const values = {
                workspace_id: body.workspace_id,
                provider: body.provider.toLowerCase(),
                encrypted_key: encrypted,
                key_hint: body.raw_key.slice(-4),
                is_valid: true,
                is_active: body.is_active ?? true,
                base_url: body.base_url ?? null,
                auth_hash: AUTH_PROVIDERS.has(body.provider) ? await sha256Hex(body.raw_key) : null,
            };
            const existing = await service.from('api_keys').select('id')
                .eq('workspace_id', body.workspace_id).eq('provider', values.provider).maybeSingle();
            const result = existing.data
                ? await service.from('api_keys').update(values).eq('id', existing.data.id).select('id, workspace_id, provider, key_hint, is_valid, is_active, base_url, created_at, updated_at').single()
                : await service.from('api_keys').insert(values).select('id, workspace_id, provider, key_hint, is_valid, is_active, base_url, created_at, updated_at').single();
            if (result.error) return serverError(result.error.message);
            return ok(result.data);
        }

        if (body.action === 'generate_auth_key') {
            if (!body.provider || !AUTH_PROVIDERS.has(body.provider)) return badRequest('Invalid auth-key provider');
            const random = crypto.getRandomValues(new Uint8Array(32));
            const rawKey = `cf_${body.provider.replace(/[^a-z0-9]/g, '_')}_${Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('')}`;
            const encrypted = await encryptSecret(rawKey);
            await service.from('api_keys').delete().eq('workspace_id', body.workspace_id).eq('provider', body.provider);
            const { data, error } = await service.from('api_keys').insert({
                workspace_id: body.workspace_id,
                provider: body.provider,
                encrypted_key: encrypted,
                auth_hash: await sha256Hex(rawKey),
                key_hint: rawKey.slice(-4),
                is_valid: true,
                is_active: true,
            }).select('id, workspace_id, provider, key_hint, is_valid, is_active, base_url, created_at, updated_at').single();
            if (error) return serverError(error.message);
            return ok({ key: data, raw_key: rawKey });
        }

        if (!body.id) return badRequest('id is required');
        const scoped = service.from('api_keys');
        if (body.action === 'toggle') {
            const { data, error } = await scoped.update({ is_active: body.is_active === true })
                .eq('id', body.id).eq('workspace_id', body.workspace_id)
                .select('id, workspace_id, provider, key_hint, is_valid, is_active, base_url, created_at, updated_at').single();
            if (error) return serverError(error.message);
            return ok(data);
        }
        if (body.action === 'delete') {
            const { error } = await scoped.delete().eq('id', body.id).eq('workspace_id', body.workspace_id);
            if (error) return serverError(error.message);
            return ok({ deleted: true });
        }
        return badRequest('Unsupported action');
    } catch (error) {
        return serverError(error instanceof Error ? error.message : String(error));
    }
});
