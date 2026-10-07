// SPDX-License-Identifier: AGPL-3.0-or-later
import {executionIdentity} from './executionIdentity';
import {AsyncLocalStorage} from 'node:async_hooks';
import {safeFetch,validateProviderBaseUrl} from './urlSafety';
import {supabase,getRunnerIdentity} from './supabase';
const current=new AsyncLocalStorage<AbortSignal>();
export function executionSignal() {return current.getStore();}
export async function withExecutionScope<T>(kind:'tasks'|'team_runs',id:string,workspaceId:string,run:()=>Promise<T>):Promise<T> {
 const controller=new AbortController();let checking=false;let attempt:string|undefined;
 const check=async()=>{
  if(checking) return;checking=true;
  try {
   const snapshot=await supabase.from(kind).select('status,claimed_by_runner,execution_attempt_id').eq('id',id).eq('workspace_id',workspaceId).single();
   const owner=getRunnerIdentity();
   if(!attempt) attempt=snapshot.data?.execution_attempt_id;
   if(!attempt || attempt!==snapshot.data?.execution_attempt_id) controller.abort(new Error('Execution attempt lost'));
   if(snapshot.error || !snapshot.data || !['running','waiting_for_input','paused'].includes(snapshot.data.status) || (owner && snapshot.data.claimed_by_runner!==owner)) controller.abort(new Error('Execution cancelled or lease lost'));
  } catch {controller.abort(new Error('Execution authority unavailable'));} finally {checking=false;}
 };
 await check();
 const poll=setInterval(()=>{void check();},1000);
 const duration=Math.min(3_600_000,Math.max(1000,Number(process.env.EXECUTION_TIMEOUT_MS)||900_000));
 const timer=setTimeout(()=>controller.abort(new Error('Execution runtime limit reached')),duration);
 try {return await executionIdentity.run({jobId:id,attemptId:attempt??''},()=>current.run(controller.signal,run));} finally {clearInterval(poll);clearTimeout(timer);}
}
/** All provider transports share the job's cancellation and lease signal. */
export const executionFetch: typeof fetch = async (input,init)=>{
 const signal=executionSignal();signal?.throwIfAborted();
 const existing=init?.signal ?? (input instanceof Request ? input.signal : undefined);
 const combined=signal ? (existing ? AbortSignal.any([signal,existing]) : signal) : existing;
 const request=new Request(input, {...init,signal:combined});
 const body=request.body ? await request.text() : undefined;
 if(body && Buffer.byteLength(body)>1_048_576) throw new Error('Provider request exceeds input limit');
 const options={method:request.method,headers:request.headers,body,signal:combined};
 const response = process.env.ALLOW_PRIVATE_PROVIDER_URLS==='true'
  ? await fetch(await validateProviderBaseUrl(request.url),{...options,redirect:'error'})
  : await safeFetch(request.url,options,120_000);
 if (response.ok) {
  if(!response.body) return response;
  let bytes=0;
  const bounded=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>8_388_608) throw new Error('Provider response exceeds output limit');controller.enqueue(chunk);}}));
  return new Response(bounded,{status:response.status,statusText:response.statusText,headers:response.headers});
 }
 // Untrusted provider errors may echo authorization headers or private prompts.
 await response.body?.cancel();
 return new Response(JSON.stringify({error:{message:`Provider request failed (HTTP ${response.status}); check account, quota or model configuration.`}}),{status:response.status,headers:{'Content-Type':'application/json'}});
};
