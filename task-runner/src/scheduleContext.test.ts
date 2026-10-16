// SPDX-License-Identifier: MIT
import {expect,it} from 'vitest';
import {buildScheduleContext,renderScheduleTemplate} from './scheduleContext';
it('renders bounded UTC context using current usage columns and explicit unknown native usage', async () => {
    const calls: string[] = [];
    const result = await buildScheduleContext(['task_summary','agent_usage'], async (table,columns,start,end) => {
        calls.push(`${table}:${columns}`);
        expect(start).toBe('2026-10-15T00:00:00.000Z');
        expect(end).toBe('2026-10-16T00:00:00.000Z');
        return table === 'tasks' ? [{title:'Review',status:'completed'}] : [
            {agent_id:'api',tokens_used:5,cost_usd:0.02,metadata:{usage_known:true}},
            {agent_id:'native',tokens_used:0,cost_usd:null,metadata:{usage_known:false}},
        ];
    },new Date('2026-10-16T00:10:00Z'));
    expect(calls[1]).toContain('cost_usd,metadata');
    expect(result).toContain('Reported tokens: 5');
    expect(result).toContain('Reported cost: $0.0200');
    expect(result).toContain('Unknown usage/cost records: 1');
    expect(renderScheduleTemplate('{{date}} {{time}}',new Date('2026-10-16T09:30:00Z'))).toBe('2026-10-16 09:30:00');
});
it('does not silently run a report after required context retrieval fails', async () => {
    await expect(buildScheduleContext(['task_summary'],async()=>{throw new Error('offline')})).rejects.toThrow('offline');
});
