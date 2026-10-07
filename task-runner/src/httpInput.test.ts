// SPDX-License-Identifier: AGPL-3.0-or-later
import {EventEmitter} from 'node:events';
import type {IncomingMessage} from 'node:http';
import {describe,it,expect,vi} from 'vitest';
import {readBody,boundedJson} from './httpInput';
function request(headers = {}) {return Object.assign(new EventEmitter(),{headers,pause:vi.fn()}) as unknown as IncomingMessage;}
describe('bounded public request parsing',()=>{
 it('rejects oversized declared and streamed bodies',async()=>{
  await expect(readBody(request({'content-length':'100'}),10)).rejects.toMatchObject({status:413});
  const req=request();const body=readBody(req,10);req.emit('data',Buffer.alloc(11));
  await expect(body).rejects.toMatchObject({status:413});expect(req.listenerCount('data')).toBe(0);
 });
 it('rejects slow and disconnected clients and cleans up',async()=>{
  const req=request();await expect(readBody(req,10,5)).rejects.toMatchObject({status:408});expect(req.listenerCount('data')).toBe(0);
  const req2=request();const body=readBody(req2);req2.emit('aborted');await expect(body).rejects.toThrow('disconnected');
 });
 it('parses UTF8 spanning chunks and requires an object',async()=>{
  const req=request();const body=readBody(req);const bytes=Buffer.from('{"value":"é"}');req.emit('data',bytes.subarray(0,11));req.emit('data',bytes.subarray(11));req.emit('end');
  expect(boundedJson(await body)).toEqual({value:'é'});expect(()=>boundedJson('[]')).toThrow('object');expect(()=>boundedJson('null')).toThrow('object');
 });
});
