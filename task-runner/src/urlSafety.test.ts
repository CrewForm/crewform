// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('node:dns/promises', () => ({lookup: vi.fn(async () => [{address:'93.184.216.34',family:4}])}));
import { lookup } from 'node:dns/promises';
import { safeFetch, validateExternalUrl, boundResponse, safeFetchInput } from './urlSafety';
beforeEach(() => { vi.mocked(lookup).mockResolvedValue([{address:'93.184.216.34',family:4}] as never); });
afterEach(() => vi.unstubAllGlobals());
describe('outbound redirect boundary', () => {
 it.each([301,302,303,307,308])('does not leak custom or standard credentials on %s', async status => {
  const fetch = vi.fn(async () => new Response('redirect',{status,headers:{location:'https://other.example.test/capture'}}));
  vi.stubGlobal('fetch',fetch);
  await expect(safeFetch('https://origin.example.test/tool',{headers:{'X-Secret':'fixture-only'}})).rejects.toThrow('Cross-origin');
  expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('does not send sensitive bodies to a new origin', async () => {
  const fetch = vi.fn(async () => new Response(null,{status:307,headers:{location:'https://other.example.test/'}}));
  vi.stubGlobal('fetch',fetch);
  await expect(safeFetch('https://origin.example.test/',{method:'POST',body:'private fixture'})).rejects.toThrow('Cross-origin');
  expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('follows safe public GET redirects but refuses HTTPS downgrade',async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null,{status:302,headers:{location:'https://other.example.test/'}})).mockResolvedValueOnce(new Response('ok'));
  vi.stubGlobal('fetch',fetch);
  expect(await (await safeFetch('https://origin.example.test/',{headers:{Accept:'text/plain'}})).text()).toBe('ok');
  fetch.mockReset().mockResolvedValue(new Response(null,{status:302,headers:{location:'http://other.example.test/'}}));
  await expect(safeFetch('https://origin.example.test/')).rejects.toThrow('downgrade');
 });
 it.each([301,302,303])('uses GET after POST redirect %s on the same origin',async status => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null,{status,headers:{location:'/next'}})).mockResolvedValueOnce(new Response('ok'));
  vi.stubGlobal('fetch',fetch);
  await safeFetch('https://origin.example.test/',{method:'POST',body:'fixture',headers:{'Content-Type':'application/json'}});
  expect(fetch.mock.calls[1][1].method).toBe('GET');
  expect(fetch.mock.calls[1][1].body).toBeUndefined();
  expect(new Headers(fetch.mock.calls[1][1].headers).has('content-type')).toBe(false);
 });
 it('revalidates the destination and does not request a private address',async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null,{status:307,headers:{location:'http://127.0.0.1/'}}));
  vi.stubGlobal('fetch',fetch);
  await expect(safeFetch('https://origin.example.test/')).rejects.toThrow('Private');
  expect(fetch).toHaveBeenCalledTimes(1);
 });
 it.each(['http://[::1]/','http://[::ffff:127.0.0.1]/','http://[fc00::1]/'])('rejects IPv6 target %s',async url => {await expect(validateExternalUrl(url)).rejects.toThrow();});
});

it('stops an unbounded remote stream without buffering it',async()=>{
 const response=boundResponse(new Response(new Uint8Array(64)),32);
 await expect(response.arrayBuffer()).rejects.toThrow('exceeds limit');
});

it('preserves authenticated SDK Request method, body and headers through the guard',async()=>{
 const fetch=vi.fn(async(_url:unknown,_init?:RequestInit)=>new Response('ok'));vi.stubGlobal('fetch',fetch);
 await safeFetchInput(new Request('https://fixture.invalid/tool',{method:'POST',headers:{Authorization:'Bearer fixture-only'},body:'fixture input'}));
 const options=fetch.mock.calls[0][1] as RequestInit;
 expect(options.method).toBe('POST');expect(options.body).toBe('fixture input');expect(new Headers(options.headers).get('Authorization')).toBe('Bearer fixture-only');
});
