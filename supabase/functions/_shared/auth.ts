// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthContext {
    userId: string;
    workspaceId: string;
    plan: string;
    apiVersion: number;
    apiKeyRateLimit: number | null;
    supabaseClient: ReturnType<typeof createClient>;
}

/**
 * Authenticate a request via JWT (Authorization: Bearer) or REST API key (X-API-Key).
 * Returns an AuthContext with userId, workspaceId, plan, apiVersion, and a Supabase client.
 */
export async function authenticateRequest(req: Request): Promise<AuthContext> {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Parse API version from header (default = 1)
    const versionHeader = req.headers.get('X-API-Version');
    const apiVersion = versionHeader ? parseInt(versionHeader, 10) || 1 : 1;

    // 1. Try JWT auth (Authorization: Bearer <token>)
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        });

        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
            throw new Error('Invalid or expired JWT token');
        }

        // Get user's first workspace + plan
        const { data: membership, error: memberError } = await supabase
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .limit(1)
            .single();

        if (memberError || !membership) {
            throw new Error('User is not a member of any workspace');
        }

        const workspaceId = (membership as { workspace_id: string }).workspace_id;

        // Fetch plan
        const { data: ws } = await supabase
            .from('workspaces')
            .select('plan')
            .eq('id', workspaceId)
            .single();

        const plan = (ws as { plan?: string } | null)?.plan ?? 'free';

        return {
            userId: user.id,
            workspaceId,
            plan,
            apiVersion,
            apiKeyRateLimit: null,
            supabaseClient: supabase,
        };
    }

    // 2. Try API key auth (X-API-Key: <key>)
    const apiKey = req.headers.get('X-API-Key');
    if (apiKey) {
        const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

        // Hash the key and look it up
        const encoder = new TextEncoder();
        const data = encoder.encode(apiKey);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const { data: apiKeyRecord, error } = await serviceClient
            .from('rest_api_keys')
            .select('id, workspace_id, permissions, rate_limit_per_min')
            .eq('key_hash', keyHash)
            .limit(1)
            .single();

        if (error || !apiKeyRecord) {
            throw new Error('Invalid API key');
        }

        const record = apiKeyRecord as {
            id: string;
            workspace_id: string;
            permissions: Record<string, unknown>;
            rate_limit_per_min: number | null;
        };

        // Update last_used_at
        await serviceClient
            .from('rest_api_keys')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', record.id);

        // Get workspace owner + plan
        const { data: wsData, error: wsError } = await serviceClient
            .from('workspaces')
            .select('owner_id, plan')
            .eq('id', record.workspace_id)
            .single();

        if (wsError || !wsData) {
            throw new Error('Workspace not found for API key');
        }

        const ws = wsData as { owner_id: string; plan?: string };

        return {
            userId: ws.owner_id,
            workspaceId: record.workspace_id,
            plan: ws.plan ?? 'free',
            apiVersion,
            apiKeyRateLimit: record.rate_limit_per_min,
            supabaseClient: serviceClient,
        };
    }

    throw new Error('Missing authentication. Provide Authorization: Bearer <jwt> or X-API-Key: <key>');
}
