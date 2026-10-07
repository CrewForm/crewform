// SPDX-License-Identifier: AGPL-3.0-or-later
// Local-only Cloud API → CLI fixture; --live-codex explicitly opts into a native login.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';
import {executeExternal} from '../../agent-runtime/index.cjs';
import {PersonalClient,executePersonalJob} from '../../cli/dist/personalWorker.js';
const workdir=process.argv[2];
if(!workdir) throw new Error('Supply an isolated local Supabase workdir');
const status=JSON.parse(execFileSync('supabase',['status','--workdir',workdir,'-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
const apiUrl=status.API_URL;
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(apiUrl)) throw new Error('This fixture may run only on a local backend');
const live=process.argv.includes('--live-codex');
if(live) console.log('Live native version: '+execFileSync('codex',['--version'],{encoding:'utf8'}).trim());
// The local Edge process may still be booting when CI starts this fixture.
let ready=false;for(let attempt=0;attempt<60;attempt++){
 try {const response=await fetch(apiUrl+'/functions/v1/personal-worker',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'status'}),signal:AbortSignal.timeout(1000)});await response.body?.cancel();if(response.status===401){ready=true;break;}} catch {}
 await sleep(500);
}
if(!ready) throw new Error('Local personal-worker Edge Function did not become ready');
const admin=createClient(apiUrl,status.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const client=createClient(apiUrl,status.ANON_KEY,{auth:{persistSession:false}});
async function checked(operation) {const result=await operation;if(result.error) throw result.error;return result.data;}
const password=randomBytes(24).toString('hex');
const created=await checked(admin.auth.admin.createUser({email:`personal-${randomBytes(6).toString('hex')}@fixture.invalid`,password,email_confirm:true}));
const user=created.user;
const directory=await mkdtemp(join(tmpdir(),'crewform-worker-e2e-'));
let uploadedPath;
try {
 await checked(client.auth.signInWithPassword({email:user.email,password}));
 const workspace=await checked(client.from('workspaces').select('id').eq('owner_id',user.id).single());
 const agent=await checked(client.from('agents').insert({workspace_id:workspace.id,name:'Personal fixture',provider:'openai',model:'default',config:{execution:{kind:'external',agent:'codex',transport:'cli'}}}).select('id').single());
 const proof=randomBytes(32).toString('base64url'),credential=randomBytes(32).toString('base64url');
 const control=new PersonalClient(apiUrl);
 const pairing=await control.request({action:'pair',proof,name:'E2E fixture laptop',runtime:'codex:cli'});
 const inspected=await checked(client.rpc('inspect_device_pairing',{p_code:pairing.code}));assert.equal(inspected.name,'E2E fixture laptop');
 await checked(client.rpc('approve_device_pairing',{p_code:pairing.code,p_workspace_id:workspace.id,p_agent_ids:[agent.id]}));
 const device=await control.request({action:'exchange',pairingId:pairing.pairingId,proof,credential});assert.equal(device.workspaceId,workspace.id);
 await checked(client.from('agents').update({config:{execution:{kind:'external',agent:'codex',transport:'cli'},paired_device_id:device.deviceId}}).eq('id',agent.id));
 const task=await checked(client.from('tasks').insert({workspace_id:workspace.id,title:live?'Reply with CrewForm worker connected':'Reply with fixture connected',description:live?'Reply with exactly CrewForm worker connected. Do not use tools or inspect files.':'Use only the supplied input file',assigned_agent_id:agent.id,created_by:user.id,status:'pending'}).select('id').single());
 if(!live) {
 uploadedPath=`${workspace.id}/${task.id}/input/fixture.txt`;
 await checked(client.storage.from('attachments').upload(uploadedPath,new Blob(['fixture input'],{type:'text/plain'}),{contentType:'text/plain',upsert:false}));
 await checked(client.from('file_attachments').insert({workspace_id:workspace.id,task_id:task.id,file_name:'fixture.txt',file_type:'text/plain',file_size:13,storage_path:uploadedPath,direction:'input',created_by:user.id}));
 }
 await checked(client.from('tasks').update({status:'dispatched'}).eq('id',task.id));
 const worker=new PersonalClient(apiUrl,credential);
 const {job}=await worker.request({action:'claim'});assert.equal(job.id,task.id);
 await executePersonalJob(worker,{directory,runtime:'codex:cli'},job,undefined,live?executeExternal:async(_execution,input)=>{
  assert.equal(await readFile(join(input.cwd,'input-1.txt'),'utf8'),'fixture input');
  input.onChunk('fixture streaming');await sleep(5600);
  const partial=await checked(client.from('tasks').select('result').eq('id',task.id).single());assert.equal(partial.result,'fixture streaming');
  return {result:'fixture connected'};
 });
 const completed=await checked(client.from('tasks').select('status,result,metadata').eq('id',task.id).single());
 assert.equal(completed.status,'completed');if(live) assert.match(completed.result,/CrewForm worker connected/);else assert.equal(completed.result,'fixture connected');assert.equal(completed.metadata.execution.usageKnown,false);
 const replacement=randomBytes(32).toString('base64url');await worker.request({action:'rotate',credential:replacement});
 await assert.rejects(worker.request({action:'status'}));
 const rotated=new PersonalClient(apiUrl,replacement);assert.equal((await rotated.request({action:'status'})).deviceId,device.deviceId);
 await checked(client.rpc('revoke_personal_device',{p_id:device.deviceId}));await assert.rejects(rotated.request({action:'claim'}));
 console.log((live?'Live Codex':'Fixture')+' personal worker E2E passed: signed approval, private attachment, heartbeat, streamed result, completion, rotation and revocation.');
} catch(error) {
 console.error('Personal worker E2E failed: '+(error instanceof Error?error.message:JSON.stringify(error)));throw error;
} finally {
 if(uploadedPath) await checked(admin.storage.from('attachments').remove([uploadedPath]));
 await checked(admin.auth.admin.deleteUser(user.id));
 await rm(directory,{recursive:true,force:true});
}
