import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
// CRITICAL: We use the SERVICE_ROLE_KEY to bypass RLS, because the Task Runner
// is a trusted backend service acting on behalf of users.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    // Bound database requests so a stalled fetch cannot wedge scheduling or
    // heartbeats indefinitely. Preserve cancellation supplied by the caller.
    global: {
        fetch: (input, init) => {
            const url = input instanceof Request ? input.url : String(input);
            // Large storage uploads/downloads have different duration needs.
            if (!new URL(url).pathname.startsWith('/rest/v1/')) return fetch(input, init);
            const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
            return fetch(input, {
                ...init,
                signal: callerSignal
                    ? AbortSignal.any([callerSignal, AbortSignal.timeout(15_000)])
                    : AbortSignal.timeout(15_000),
            });
        },
    },
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
});
