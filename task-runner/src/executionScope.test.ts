// SPDX-License-Identifier: MIT
import {afterEach,describe,it,expect,vi} from 'vitest';
const fixture=vi.hoisted(()=>({status:'running',runner:'owner',attempt:'attempt-one',suspended:false}));
vi.mock('./supabase',()=>({getRunnerIdentity:()=> 'owner',supabase:{from:()=>({select:()=>({eq:()=>({eq:()=>({single:async()=>({data:{status:fixture.status,claimed_by_runner:fixture.runner,execution_attempt_id:fixture.attempt,workspaces:{suspended_at:fixture.suspended?'2026-10-16T00:00:00Z':null}},error:null})})})})})}}));
vi.mock('./urlSafety',()=>({safeFetch:(url: string,init: RequestInit)=>fetch(url,init),validateProviderBaseUrl:async(url:string)=>new URL(url)}));
import {withExecutionScope,executionFetch} from './executionScope';
afterEach(()=>{fixture.status='running';fixture.runner='owner';fixture.attempt='attempt-one';fixture.suspended=false;vi.useRealTimers();vi.unstubAllGlobals();});
describe('provider cancellation and execution leases',()=>{
 it('rejects provider requests for a cancelled or reassigned job',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  fixture.status='cancelled';
  await expect(withExecutionScope('tasks','job','workspace',async()=>executionFetch('https://fixture.invalid'))).rejects.toThrow('cancelled');
  fixture.status='running';fixture.runner='someone-else';
  await expect(withExecutionScope('tasks','job','workspace',async()=>executionFetch('https://fixture.invalid'))).rejects.toThrow('lease');expect(fetch).not.toHaveBeenCalled();
 });
 it('rejects an older attempt even when the same runner owns the new one',async()=>{
  vi.useFakeTimers();
  vi.stubGlobal('fetch',(_url:unknown,init:RequestInit|undefined)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('attempt stopped')))));
  const run=withExecutionScope('tasks','job','workspace',()=>executionFetch('https://fixture.invalid'));
  const rejected=expect(run).rejects.toThrow('attempt stopped');
  await vi.advanceTimersByTimeAsync(0);fixture.attempt='attempt-two';await vi.advanceTimersByTimeAsync(1001);await rejected;
 });
 it('aborts an in-flight request when authority is revoked',async()=>{
  vi.useFakeTimers();
  vi.stubGlobal('fetch',(_url: unknown,init: RequestInit | undefined)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('stopped')))));
  const run=withExecutionScope('tasks','job','workspace',async()=>executionFetch('https://fixture.invalid'));
  const rejected=expect(run).rejects.toThrow('stopped');
  await vi.advanceTimersByTimeAsync(0);fixture.status='cancelled';await vi.advanceTimersByTimeAsync(1001);await rejected;
 });
 it('aborts an in-flight provider call when the workspace is suspended',async()=>{
  vi.useFakeTimers();
  vi.stubGlobal('fetch',(_url:unknown,init:RequestInit|undefined)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('workspace stopped')))));
  const run=withExecutionScope('team_runs','job','workspace',()=>executionFetch('https://fixture.invalid'));
  const rejected=expect(run).rejects.toThrow('workspace stopped');
  await vi.advanceTimersByTimeAsync(0);fixture.suspended=true;await vi.advanceTimersByTimeAsync(1001);await rejected;
 });
});

describe('provider error redaction',()=>{
 it('does not reflect a provider-echoed credential into task errors',async()=>{
  vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({error:{message:'Authorization: Bearer fixture-secret'}}),{status:401}));
  const response=await executionFetch('https://fixture.invalid');
  expect(response.status).toBe(401);expect(await response.text()).not.toContain('fixture-secret');
 });
});
