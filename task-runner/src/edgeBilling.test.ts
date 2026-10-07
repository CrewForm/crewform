// SPDX-License-Identifier: AGPL-3.0-or-later
// Exercise the actual Deno handlers with local fake Stripe/Supabase clients.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {describe,it,expect,vi} from 'vitest';
import {PLAN_CATALOGUE} from './planCatalogue';
function loadHandler(name: string, role: string, options: {databaseFailure?: boolean; unknownPrice?: boolean} = {}) {
    let handler: (request: Request) => Promise<Response> = async () => new Response();
    const stripeCalls = vi.fn(); const queryCalls: Array<[string,unknown]> = [];
    const query: Record<string,unknown> = {};
    for (const method of ['select','eq','limit','upsert','update']) query[method]=(...args: unknown[])=>{queryCalls.push([method,args]);return query;};
    query.single=async()=>({data:{workspace_id:'10000000-0000-0000-0000-000000000001',role},error:null});
    query.maybeSingle=async()=>({data:{stripe_customer_id:'cus_fixture'},error:null});
    const client={auth:{getUser:async()=>({data:{user:{id:'owner',email:'owner@fixture.invalid'}},error:null})},from:()=>query,rpc:vi.fn(async()=>({error:options.databaseFailure?{message:'database unavailable'}:null,data:[{token:'fixture-token',url:null}]}))};
    class Stripe {
        static createFetchHttpClient=()=>({});
        prices={retrieve:async()=>{stripeCalls('price');return {active:true,currency:'usd',unit_amount:1500,recurring:{interval:'month',interval_count:1}};}};
        customers={retrieve:async()=>({id:'cus_fixture'})};
        checkout={sessions:{create:async()=>{stripeCalls('checkout');return {id:'session-fixture',expires_at:Date.now()/1000+1800,url:'https://fixture.invalid/checkout'};}}};
        billingPortal={sessions:{create:async()=>{stripeCalls('portal');return {url:'https://fixture.invalid/portal'};}}};
        subscriptions={list:async()=>({data:[]}),retrieve:async()=>({id:'sub_fixture',customer:'cus_fixture',status:'active',metadata:{workspace_id:'10000000-0000-0000-0000-000000000001'},items:{data:[{price:{id:options.unknownPrice?'price_unknown':'price_pro'}}]}})};
        webhooks={constructEventAsync:async()=>({id:'event_fixture',created:10,type:'customer.subscription.updated',data:{object:{id:'sub_fixture'}}})};
    }
    let source=readFileSync(resolve(process.cwd(),`../supabase/functions/${name}/index.ts`),'utf8');
    source=source.replace(/^import .*;\s*$/gm,'');
    const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    const env: Record<string,string>={SUPABASE_URL:'https://db.fixture.invalid',SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture',STRIPE_PRO_PRICE_ID:'price_pro',STRIPE_TEAM_PRICE_ID:'price_team'};
    const json=(message: string,status: number)=>new Response(JSON.stringify({error:message}),{status});
    vm.runInNewContext(code,{exports:{},Response,Request,URL,console:{log:()=>{},warn:()=>{},error:()=>{}},PLAN_CATALOGUE,Stripe,createClient:()=>client,
        readJson:(req:Request)=>req.json(),readText:(req:Request)=>req.text(),handleCors:()=>null,
        badRequest:(m:string)=>json(m,400),forbidden:(m:string)=>json(m,403),unauthorized:(m:string)=>json(m,401),serverError:(m:string)=>json(m,500),methodNotAllowed:()=>json('method',405),
        Deno:{env:{get:(key:string)=>env[key]},serve:(fn:typeof handler)=>{handler=fn;}}});
    return {handler,stripeCalls,queryCalls,client};
}
describe('billing authorization and reconciliation boundaries',()=>{
 it.each(['member','manager'])('rejects %s before making any Stripe call',async role=>{
  for(const endpoint of ['stripe-checkout','stripe-portal']) {
   const fixture=loadHandler(endpoint,role);
   const response=await fixture.handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({workspace_id:'10000000-0000-0000-0000-000000000001',plan:'pro'})}));
   expect(response.status).toBe(403);expect(fixture.stripeCalls).not.toHaveBeenCalled();
  }
 });
 it.each(['owner','admin'])('uses explicitly selected workspace for %s',async role=>{
  const fixture=loadHandler('stripe-checkout',role);
  const response=await fixture.handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({workspace_id:'10000000-0000-0000-0000-000000000001',plan:'pro'})}));
  expect(response.status).toBe(200);expect(fixture.queryCalls).toContainEqual(['eq',['workspace_id','10000000-0000-0000-0000-000000000001']]);
 });
 it('rejects missing workspace instead of silently selecting the first membership',async()=>{
  const fixture=loadHandler('stripe-portal','owner');
  expect((await fixture.handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:'{}'}))).status).toBe(400);
  expect(fixture.stripeCalls).not.toHaveBeenCalled();
 });
 it.each([{databaseFailure:true},{unknownPrice:true}])('does not acknowledge unapplied Stripe events (%j)',async options=>{
  const fixture=loadHandler('stripe-webhook','owner',options);
  expect((await fixture.handler(new Request('https://fixture.invalid',{method:'POST',headers:{'stripe-signature':'fixture'},body:'{}'}))).status).toBe(500);
 });
});
