// SPDX-License-Identifier: MIT
// Local Supabase + real runner + deterministic native protocol peer. No model calls.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(resolve(root,'task-runner/package.json'));
const {createClient}=require('@supabase/supabase-js');
const dotenv=require('dotenv');
const status=dotenv.parse(execFileSync('supabase',['status','--workdir',resolve(process.argv[2]??'.crewform-local'),'-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
if(!['127.0.0.1','localhost'].includes(new URL(status.API_URL).hostname)) throw new Error('This fixture requires a local Supabase backend.');
const temporary=mkdtempSync(resolve(tmpdir(),'crewform-pipeline-e2e-'));
const previousDirectory=process.cwd();
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let userId,workspaceId,runnerId;
const checked=response=>{if(response.error) throw response.error;return response.data};
try {
    const password=randomBytes(32).toString('hex');
    const email=`pipeline-${randomBytes(8).toString('hex')}@fixture.invalid`;
    const created=checked(await admin.auth.admin.createUser({email,password,email_confirm:true}));
    userId=created.user.id;
    const user=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    checked(await user.auth.signInWithPassword({email,password}));
    workspaceId=checked(await admin.from('workspaces').select('id').eq('owner_id',userId).single()).id;
    const agents=checked(await user.from('agents').insert(['Reviewer','Critic'].map(name=>({workspace_id:workspaceId,name,model:'default',provider:'openai',tools:[],config:{execution:{kind:'external',agent:'codex',transport:'cli'}}}))).select());
    const team=checked(await user.from('teams').insert({workspace_id:workspaceId,name:'Recovery fixture',mode:'pipeline',config:{auto_handoff:false,steps:agents.map(agent=>({agent_id:agent.id,step_name:agent.name,instructions:'Reply with fixture evidence',expected_output:'Text',on_failure:'stop',max_retries:0}))}}).select().single());
    const run=checked(await user.from('team_runs').insert({team_id:team.id,workspace_id:workspaceId,input_task:'Supplied fixture notes only',created_by:userId,status:'pending'}).select().single());
    const runner=checked(await admin.from('task_runners').insert({instance_name:'pipeline-recovery-e2e',max_concurrency:3}).select().single());
    runnerId=runner.id;
    Object.assign(process.env,{SUPABASE_URL:status.API_URL,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,
        API_KEY_ENCRYPTION_KEY:randomBytes(32).toString('hex'),CREWFORM_EXTERNAL_AGENTS_ENABLED:'true',
        CREWFORM_EXTERNAL_WORKSPACE_ID:workspaceId,CREWFORM_EXTERNAL_USER_ID:userId,CREWFORM_EXTERNAL_CWD:temporary,
        CREWFORM_CODEX_CLI_PATH:resolve(root,'agent-runtime/test/fake-agent.cjs')});
    process.chdir(temporary); // Never load a checkout's production .env.
    const {supabase,setRunnerIdentity}=require(resolve(root,'task-runner/dist/supabase.js'));
    setRunnerIdentity(runnerId);
    const {processPipelineRun}=require(resolve(root,'task-runner/dist/pipelineExecutor.js'));
    const claim=async()=>{
        const rows=checked(await supabase.rpc('claim_next_team_run',{p_runner_id:runnerId}));
        assert.equal(rows[0]?.id,run.id,'Unexpected local work claimed; use an isolated test backend');
        return rows[0];
    };
    await processPipelineRun(await claim());
    const paused=checked(await admin.from('team_runs').select('*').eq('id',run.id).single());
    assert.equal(paused.status,'paused');
    const first=checked(await user.from('pipeline_checkpoints').select('*').eq('run_id',run.id).single());
    assert.equal(first.next_step,1); assert.equal(first.in_flight,null);
    assert.equal(first.results[0].output,'fixture response');
    checked(await user.rpc('continue_pipeline_run',{p_run:run.id,p_revision:first.revision,p_approval:first.approval.id}));
    await processPipelineRun(await claim());
    const finished=checked(await admin.from('team_runs').select('status,output').eq('id',run.id).single());
    assert.equal(finished.status,'completed'); assert.equal(finished.output,'fixture response');
    const checkpoint=checked(await user.from('pipeline_checkpoints').select('*').eq('run_id',run.id).single());
    assert.equal(checkpoint.next_step,2); assert.equal(checkpoint.decisions.length,1);
    assert.equal(checkpoint.decisions[0].actor,userId);
    assert.ok(checkpoint.results.every(result=>result.usage.usageKnown===false));
    const messages=checked(await user.from('team_messages').select('id').eq('run_id',run.id).eq('message_type','result'));
    assert.equal(messages.length,2,'A committed step was replayed');
    const attempts=checked(await user.from('execution_attempts').select('id').eq('job_id',run.id).eq('job_kind','team_runs'));
    assert.equal(attempts.length,2);
    console.log('Pipeline recovery E2E passed: native consent, committed output reuse, human decision, two attempts, no repeated step.');
} finally {
    process.chdir(previousDirectory);
    if(workspaceId) checked(await admin.from('workspaces').delete().eq('id',workspaceId));
    if(userId) checked(await admin.auth.admin.deleteUser(userId));
    if(runnerId) checked(await admin.from('task_runners').delete().eq('id',runnerId));
    rmSync(temporary,{recursive:true,force:true});
}
