// SPDX-License-Identifier: AGPL-3.0-or-later
import {executionIdentity} from './executionIdentity';
import {boundResponse} from './urlSafety';
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

let runnerIdentity: string | null = null;
export function getRunnerIdentity() { return runnerIdentity; }
export function setRunnerIdentity(id: string) { runnerIdentity = id; }

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    // Bound database requests so a stalled fetch cannot wedge scheduling or
    // heartbeats indefinitely. Preserve cancellation supplied by the caller.
    global: {
        fetch: (input, init) => {
            const url = input instanceof Request ? input.url : String(input);
            // Large storage uploads/downloads have different duration needs.
            if (!new URL(url).pathname.startsWith('/rest/v1/')) {
                const signal=init?.signal ?? (input instanceof Request ? input.signal : undefined);
                return fetch(input,{...init,signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000)}).then(response=>boundResponse(response,10*1024*1024));
            }
            const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
            const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
            if (runnerIdentity) headers.set('x-crewform-runner-id', runnerIdentity);
            const identity=executionIdentity.getStore();
            if(identity) {headers.set('x-crewform-execution-job',identity.jobId);headers.set('x-crewform-execution-attempt',identity.attemptId);}
            return fetch(input, {
                ...init, headers,
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
