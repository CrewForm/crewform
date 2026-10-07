// SPDX-License-Identifier: AGPL-3.0-or-later
import {afterEach,it,expect,vi} from 'vitest';
const fixture=vi.hoisted(()=>({records:[] as unknown[],download:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:()=>{const query={select:()=>query,eq:()=>query,limit:()=>query,then:(resolve:(value:{data:unknown[];error:null})=>unknown)=>Promise.resolve({data:fixture.records,error:null}).then(resolve)};return query;},storage:{from:()=>({download:fixture.download})}}}));
import {loadInputFiles} from './fileAttachments';
afterEach(()=>{fixture.records=[];fixture.download.mockReset();});
it('rejects legacy foreign attachment metadata before privileged download',async()=>{
 fixture.records=[{workspace_id:'other',storage_path:'other/job/input/file',file_size:1}];
 await expect(loadInputFiles('job',null,'own')).rejects.toThrow('scope');expect(fixture.download).not.toHaveBeenCalled();
});
it('fails required input rather than silently invoking a model without it',async()=>{
 fixture.records=[{workspace_id:'own',storage_path:'own/job/input/file',file_size:1,file_name:'fixture.txt',file_type:'text/plain'}];
 fixture.download.mockResolvedValue({data:null,error:{message:'fixture unavailable'}});
 await expect(loadInputFiles('job',null,'own')).rejects.toThrow('Required input');
});
