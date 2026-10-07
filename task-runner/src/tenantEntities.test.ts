// SPDX-License-Identifier: AGPL-3.0-or-later
import {describe,it,expect,vi} from 'vitest';
const fixture=vi.hoisted(()=>({rows:[{id:'private',workspace_id:'other',webhook_headers:{Authorization:'fixture-secret'}}],workspace:''}));
vi.mock('./supabase',()=>({supabase:{from:()=>({select:()=>({eq:(_field:string,workspace:string)=>{fixture.workspace=workspace;return {in:async()=>({data:fixture.rows.filter(row=>row.workspace_id===workspace),error:null})};}})})}}));
import {loadTenantEntities} from './tenantEntities';
describe('configuration references cannot cross tenant boundaries',()=>{
 it.each(['agents','custom_tools'] as const)('rejects foreign %s UUIDs before exposing configuration',async table=>{
  await expect(loadTenantEntities(table,'mine',['private'])).rejects.toThrow('this workspace');expect(fixture.workspace).toBe('mine');
 });
 it('loads only authorized configured entities',async()=>{
  fixture.rows=[{id:'own',workspace_id:'mine',webhook_headers:{Authorization:'fixture-secret'}}];
  expect(await loadTenantEntities('custom_tools','mine',['own','own'])).toHaveLength(1);
 });
});
