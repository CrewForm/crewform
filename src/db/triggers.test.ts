// SPDX-License-Identifier: MIT
import {expect,it,vi} from 'vitest'
const {from} = vi.hoisted(() => ({from: vi.fn()}))
vi.mock('@/lib/supabase', () => ({supabase: {from}}))
vi.mock('@/lib/enforceQuota', () => ({enforceQuota: vi.fn()}))
import {createTrigger,createTeamTrigger} from './triggers'
it('rejects malformed agent and team schedules before database mutation', async () => {
    for (const expression of ['0foo 9 * * *','0 9 0 * *','*/0 * * * *']) {
        await expect(createTrigger({agent_id:'agent',workspace_id:'workspace',trigger_type:'cron',cron_expression:expression,task_title_template:'Report'})).rejects.toThrow(/five-field/)
        await expect(createTeamTrigger({team_id:'team',workspace_id:'workspace',trigger_type:'cron',cron_expression:expression,task_title_template:'Report'})).rejects.toThrow(/five-field/)
    }
    expect(from).not.toHaveBeenCalled()
})
