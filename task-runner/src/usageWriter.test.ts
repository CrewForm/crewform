// SPDX-License-Identifier: MIT
import {expect,it,vi} from 'vitest';
const {insert}=vi.hoisted(()=>({insert:vi.fn().mockResolvedValue({error:null})}));
vi.mock('./supabase',()=>({supabase:{from:()=>({insert})}}));
import {writeTeamRunUsageRecord} from './usageWriter';
it('mixed fan-out usage preserves reported cost without claiming a known total',async()=>{
    await writeTeamRunUsageRecord({workspaceId:'workspace',teamRunId:'run',agentId:'merge',provider:'mixed',model:'mixed',
        stepIndex:1,stepName:'Fan-out',tokensUsed:8,costEstimateUsd:0.02,usageKnown:false});
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({cost_usd:null,
        metadata:expect.objectContaining({usage_known:false,cost_known:false,reported_cost_usd:0.02})}));
});
