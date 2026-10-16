// SPDX-License-Identifier: MIT
// Real local HTTP worker endpoints and runner, deterministic CLI/ACP peers only.
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {executeExternal} from '../../agent-runtime/index.cjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(resolve(root,'task-runner/package.json'));
const {createClient}=require('@supabase/supabase-js');
const {PersonalClient,executePersonalJob}=await import(pathToFileURL(resolve(root,'cli/dist/personalWorker.js')).href);
const status=JSON.parse(execFileSync('supabase',['status','--workdir',resolve(process.argv[2]??'.crewform-local'),'-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(status.API_URL)) throw new Error('Use an isolated local Supabase backend.');
const temporary=await mkdtemp(join(tmpdir(),'crewform-personal-pipeline-'));
const previousDirectory=process.cwd();
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=response=>{if(response.error) throw response.error;return response.data};
let userId,workspaceId,runnerId,uploadedPath;
try {
    let ready=false;
    for(let index=0;index<60;index++) {
        try {const response=await fetch(status.API_URL+'/functions/v1/personal-worker',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"status"}',signal:AbortSignal.timeout(1000)});await response.body?.cancel();if(response.status===401){ready=true;break;}} catch {}
        await sleep(500);
    }
    if(!ready) throw new Error('Local worker endpoint unavailable. Serve personal-worker before running this fixture.');
    const password=randomBytes(32).toString('hex'),email=`personal-pipeline-${randomBytes(8).toString('hex')}@fixture.invalid`;
    userId=checked(await admin.auth.admin.createUser({email,password,email_confirm:true})).user.id;
    const user=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    checked(await user.auth.signInWithPassword({email,password}));
    workspaceId=checked(await admin.from('workspaces').select('id').eq('owner_id',userId).single()).id;
    const agents=checked(await user.from('agents').insert([
        {workspace_id:workspaceId,name:'Fixture reviewer',model:'default',provider:'openai',system_prompt:'FIXTURE_REVIEWER',tools:[],config:{execution:{kind:'external',agent:'codex',transport:'cli'}}},
        {workspace_id:workspaceId,name:'Fixture critic',model:'default',provider:'openai',system_prompt:'FIXTURE_CRITIC',tools:[],config:{execution:{kind:'external',agent:'claude',transport:'acp'}}},
    ]).select());
    const workers=[];
    for(const [index,runtime] of ['codex:cli','claude:acp'].entries()) {
        const proof=randomBytes(32).toString('base64url'),credential=randomBytes(32).toString('base64url');
        const control=new PersonalClient(status.API_URL);
        const pairing=await control.request({action:'pair',proof,name:`Fixture device ${index+1}`,runtime});
        checked(await user.rpc('approve_device_pairing',{p_code:pairing.code,p_workspace_id:workspaceId,p_agent_ids:[agents[index].id]}));
        const device=await control.request({action:'exchange',pairingId:pairing.pairingId,proof,credential});
        agents[index].config={...agents[index].config,paired_device_id:device.deviceId};
        checked(await user.from('agents').update({config:agents[index].config}).eq('id',agents[index].id));
        const directory=join(temporary,`worker-${index}`);await mkdir(directory,{mode:0o700});
        workers.push({client:new PersonalClient(status.API_URL,credential),directory,runtime});
    }
    const contract=properties=>({version:1,schema:{type:'object',additionalProperties:false,required:Object.keys(properties),properties}});
    const contracts=[contract({version:{type:'integer',enum:[1]},source:{type:'string'},finding:{type:'string'}}),
        contract({version:{type:'integer',enum:[1]},source:{type:'string'},supported:{type:'boolean'}})];
    const team=checked(await user.from('teams').insert({workspace_id:workspaceId,name:'Paired recovery fixture',mode:'pipeline',config:{auto_handoff:false,steps:agents.map((agent,index)=>({agent_id:agent.id,step_name:agent.name,instructions:'Use only supplied evidence',expected_output:'Contract JSON',output_contract:contracts[index],on_failure:'stop',max_retries:0}))}}).select().single());
    const run=checked(await user.from('team_runs').insert({team_id:team.id,workspace_id:workspaceId,input_task:'Supplied fictional patch P1:3',created_by:userId,status:'pending'}).select().single());
    uploadedPath=`${workspaceId}/${run.id}/input/fixture.txt`;
    const text='Supplied fictional patch P1:3';
    checked(await user.storage.from('attachments').upload(uploadedPath,new Blob([text],{type:'text/plain'}),{contentType:'text/plain',upsert:false}));
    checked(await user.from('file_attachments').insert({workspace_id:workspaceId,team_run_id:run.id,file_name:'fixture.txt',file_type:'text/plain',file_size:Buffer.byteLength(text),storage_path:uploadedPath,direction:'input',created_by:userId}));
    // No runner is polling this isolated backend yet; explicitly approve the final input snapshot.
    checked(await user.from('team_runs').update({status:'pending'}).eq('id',run.id));
    runnerId=checked(await admin.from('task_runners').insert({instance_name:'paired-pipeline-e2e',max_concurrency:3}).select().single()).id;
    Object.assign(process.env,{SUPABASE_URL:status.API_URL,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,
        API_KEY_ENCRYPTION_KEY:randomBytes(32).toString('hex'),CREWFORM_EXTERNAL_AGENTS_ENABLED:'false',
        CREWFORM_CODEX_CLI_PATH:resolve(root,'agent-runtime/test/fake-agent.cjs'),CREWFORM_CLAUDE_ACP_PATH:resolve(root,'agent-runtime/test/fake-agent.cjs')});
    process.chdir(temporary);
    const {supabase,setRunnerIdentity}=require(resolve(root,'task-runner/dist/supabase.js'));setRunnerIdentity(runnerId);
    const {processPipelineRun}=require(resolve(root,'task-runner/dist/pipelineExecutor.js'));
    const claim=async()=>{const rows=checked(await supabase.rpc('claim_next_team_run',{p_runner_id:runnerId}));assert.equal(rows[0]?.id,run.id);return rows[0];};
    const work=async worker=>{
        let job;
        for(let index=0;index<40;index++) {const result=await worker.client.request({action:'claim'});if(result.job){job=result.job;break;}await sleep(250);}
        assert.ok(job,'Approved device did not receive its pipeline step');
        assert.notEqual(job.id,run.id);assert.equal(job.attachments.length,1);
        await executePersonalJob(worker.client,worker,job,undefined,async(execution,input)=>{
            assert.equal(await readFile(join(input.cwd,'input-1.txt'),'utf8'),text);
            return executeExternal(execution,input);
        });
    };
    const first=processPipelineRun(await claim());await work(workers[0]);await first;
    assert.equal(checked(await user.from('team_runs').select('status').eq('id',run.id).single()).status,'paused');
    const checkpoint=checked(await user.from('pipeline_checkpoints').select('revision,approval').eq('run_id',run.id).single());
    checked(await user.rpc('continue_pipeline_run',{p_run:run.id,p_revision:checkpoint.revision,p_approval:checkpoint.approval.id}));
    const second=processPipelineRun(await claim());await work(workers[1]);await second;
    const finished=checked(await user.from('team_runs').select('status,output').eq('id',run.id).single());
    assert.equal(finished.status,'completed');assert.deepEqual(JSON.parse(finished.output),{version:1,supported:true,source:'P1:3'});
    const jobs=checked(await user.from('personal_pipeline_jobs').select('status,device_id,step_idx').eq('run_id',run.id));
    assert.equal(jobs.length,2);assert.ok(jobs.every(job=>job.status==='completed'));assert.notEqual(jobs[0].device_id,jobs[1].device_id);
    assert.equal(checked(await admin.from('execution_usage').select('job_id').eq('workspace_id',workspaceId)).length,1);
    console.log('Personal pipeline E2E passed: two approved profiles, CLI→ACP handoff, private attachments, human approval, one hosted reservation, no managed native login.');
} finally {
    process.chdir(previousDirectory);
    if(uploadedPath) checked(await admin.storage.from('attachments').remove([uploadedPath]));
    if(workspaceId) checked(await admin.from('workspaces').delete().eq('id',workspaceId));
    if(userId) checked(await admin.auth.admin.deleteUser(userId));
    if(runnerId) checked(await admin.from('task_runners').delete().eq('id',runnerId));
    await rm(temporary,{recursive:true,force:true});
}
