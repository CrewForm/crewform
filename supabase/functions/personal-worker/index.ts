// SPDX-License-Identifier: AGPL-3.0-or-later
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { personalWorkerHandler, personalBackendFetch } from '../_shared/personalWorker.ts';
const backend=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{global:{fetch:personalBackendFetch()}});
Deno.serve(personalWorkerHandler(backend));
