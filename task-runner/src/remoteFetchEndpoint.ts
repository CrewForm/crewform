// SPDX-License-Identifier: AGPL-3.0-or-later
import type {IncomingMessage,ServerResponse} from 'node:http';
import {readBody,boundedJson,HttpInputError} from './httpInput';
import {safeFetch,readTextLimited,validateProviderBaseUrl} from './urlSafety';
/** Edge Functions delegate outbound requests to the socket-level egress guard. */
export async function handleRemoteFetch(req:IncomingMessage,res:ServerResponse):Promise<boolean> {
 if(req.url !== '/_internal/remote-fetch') return false;
 const secret=process.env.WEBHOOK_SECRET;
 if(req.method!=='POST' || !secret || req.headers['x-webhook-secret']!==secret) {res.writeHead(401);res.end();return true;}
 const body=boundedJson(await readBody(req));
 if(typeof body.url!=='string' || (body.body!==undefined && typeof body.body!=='string') || (body.method!==undefined && (typeof body.method!=='string'|| !['GET','POST','PUT','PATCH','DELETE','HEAD'].includes(body.method)))) throw new HttpInputError('Invalid outbound request');
 const headers=new Headers(body.headers as HeadersInit | undefined);
 if([...headers.keys()].some(key=>['host','connection','transfer-encoding','proxy-authorization'].includes(key)||key.startsWith('x-forwarded-'))) throw new HttpInputError('Invalid transport header');
 const init:RequestInit={method:body.method as string|undefined,headers,body:body.body as string|undefined,signal:AbortSignal.timeout(15_000)};
 let response:Response;
 if(body.provider===true && process.env.ALLOW_PRIVATE_PROVIDER_URLS==='true') response=await fetch(await validateProviderBaseUrl(body.url),{...init,redirect:'error'});
 else response=await safeFetch(body.url,init);
 const text=await readTextLimited(response,2_097_152);
 const responseHeaders: Record<string,string> = {'Content-Type':response.headers.get('content-type')??'text/plain'};
 for (const key of ['mcp-session-id','mcp-protocol-version','retry-after']) { const value=response.headers.get(key); if(value) responseHeaders[key]=value; }
 res.writeHead(response.status,responseHeaders);
 res.end(text);
 return true;
}
