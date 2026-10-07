// SPDX-License-Identifier: AGPL-3.0-or-later
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const container=process.argv[2]??'supabase_db_crewform-securitycheck';
function sql(statement) {return new Promise(resolve=>{const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1']);let output='',error='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>error+=v);child.on('close',code=>resolve({code,output,error}));child.stdin.end(statement);});}
const owner='11000000-0000-0000-0000-000000000001';
try {
 const setup=await sql(`INSERT INTO auth.users(id,email) VALUES('${owner}','concurrency@hardening.invalid'); UPDATE public.workspaces SET is_beta=false,trial_expires_at=NULL WHERE owner_id='${owner}'; INSERT INTO public.workspace_entitlement_overrides SELECT id,'tasks_per_month',1 FROM public.workspaces WHERE owner_id='${owner}'; UPDATE public.deployment_policy SET hosted=true;`);
 assert.equal(setup.code,0,setup.error);
 const results=await Promise.all(Array.from({length:12},(_,i)=>sql(`SELECT set_config('request.jwt.claims','{"role":"service_role"}',false); INSERT INTO public.tasks(workspace_id,title,status,created_by) SELECT id,'Concurrent ${i}','dispatched',owner_id FROM public.workspaces WHERE owner_id='${owner}';`)));
 assert.equal(results.filter(r=>r.code===0).length,1);
 assert.ok(results.filter(r=>r.code!==0).every(r=>r.error.includes('Monthly workflow run limit')));
 console.log('12 concurrent enqueue requests: exactly 1 reserved; 11 rejected by durable quota.');
} finally {
 const cleanup=await sql(`DELETE FROM public.workspaces WHERE owner_id='${owner}'; DELETE FROM auth.users WHERE id='${owner}'; UPDATE public.deployment_policy SET hosted=false;`);
 assert.equal(cleanup.code,0,cleanup.error);
}
