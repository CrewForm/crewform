// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,symlink,rmdir,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {executePersonalJob,PersonalClient} from '../dist/personalWorker.js';
const job={id:'11111111-1111-4111-8111-111111111111',attemptId:'22222222-2222-4222-8222-222222222222',runtime:'codex:cli',execution:{kind:'external',agent:'codex',transport:'cli'},model:'default',prompt:'Summarise supplied text',systemPrompt:'Be concise',attachments:[{id:'33333333-3333-4333-8333-333333333333',size:5,type:'text/plain'}]};
test('personal worker uses only a private job directory and publishes an attempt-bound result',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'crewform-personal-'));const calls=[];
 try {
  const client={request:async body=>{calls.push(body);return body.action==='attachment'?Buffer.from('hello'):{ok:true};}};
  await executePersonalJob(client,{directory,runtime:'codex:cli'},{...job,execution:{...job.execution,cwd:'/untrusted',command:'sh',env:{SECRET:'ignored'}}},undefined,async(execution,input)=>{
   assert.equal(execution.agent,'codex');assert.equal(input.cwd.startsWith((await realpath(directory))+'/job-'),true);assert.equal(await readFile(join(input.cwd,'input-1.txt'),'utf8'),'hello');assert.equal(input.env,undefined);assert.equal(execution.command,undefined);
   input.onChunk('summary');return {result:'summary'};
  });
  const result=calls.find(c=>c.outcome==='completed');assert.equal(result.attemptId,job.attemptId);assert.equal(result.taskId,job.id);assert.equal(result.sequence,1);assert.equal(result.text,'summary');
 } finally {await rmdir(directory);}
});
test('unsupported runtimes, oversized files and symlink roots never start an agent',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'crewform-personal-'));let executed=false;
 const client={request:async()=>({ok:true})};const execute=async()=>{executed=true;return {result:''};};
 try {
  await assert.rejects(executePersonalJob(client,{directory,runtime:'claude:cli'},job,undefined,execute),/Unapproved/);
  await assert.rejects(executePersonalJob(client,{directory,runtime:job.runtime},{...job,attachments:[{...job.attachments[0],size:10_485_761}]},undefined,execute),/invalid/);
  const link=directory+'-link';await symlink(directory,link);
  try {await assert.rejects(executePersonalJob(client,{directory:link,runtime:job.runtime},job,undefined,execute),/symlink/);} finally {await rm(link);}
  assert.equal(executed,false);
 } finally {await rmdir(directory);}
});
test('revoked authority aborts an active agent within the documented deadline and sends no completion',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'crewform-personal-'));let heartbeat=0;const calls=[];const started=Date.now();
 try {
  const client={request:async body=>{calls.push(body);if(body.action==='heartbeat'&&++heartbeat>1)throw new Error('revoked');return {ok:true};}};
  await assert.rejects(executePersonalJob(client,{directory,runtime:job.runtime},{...job,attachments:[]},undefined,async(_execution,input)=>new Promise((_resolve,reject)=>input.signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}))),/cancelled/);
  assert.ok(Date.now()-started<9000);assert.equal(calls.some(c=>c.outcome==='completed'),false);
 } finally {await rmdir(directory);}
});
test('personal credential is not forwarded when the control endpoint redirects',async()=>{
 let received=0;const target=createServer((_req,res)=>{received++;res.end('{}');});await new Promise(resolve=>target.listen(0,'127.0.0.1',resolve));
 const source=createServer((_req,res)=>{res.writeHead(307,{Location:`http://127.0.0.1:${target.address().port}/evil`});res.end();});await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));
 try {await assert.rejects(new PersonalClient(`http://127.0.0.1:${source.address().port}`,'a'.repeat(43)).request({action:'claim'}));assert.equal(received,0);} finally {await new Promise(resolve=>source.close(resolve));await new Promise(resolve=>target.close(resolve));}
});

test('untrusted device metadata cannot inject commands into the OS credential store',async()=>{
 const {saveDevice}=await import('../dist/personalWorker.js');
 assert.throws(()=>saveDevice({deviceId:'x\nadd-generic-password -w injected',workspaceId:job.id,expiresAt:new Date().toISOString(),apiUrl:'https://control.test',directory:'/untrusted',runtime:'codex:cli'},'a'.repeat(43)),/Invalid device configuration/);
 assert.throws(()=>saveDevice({deviceId:job.id,workspaceId:job.attemptId,expiresAt:new Date().toISOString(),apiUrl:'https://control.test',directory:'/untrusted',runtime:'codex:cli'},'a\n'.repeat(22)),/Invalid device configuration/);
});
