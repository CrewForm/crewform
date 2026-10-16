// SPDX-License-Identifier: MIT
import {cronMatchesDate, isTriggerDue} from './cron.ts';
import {buildScheduleContext} from './scheduleContext.ts';
const cases = JSON.parse(await Deno.readTextFile(new URL('./cron-cases.json', import.meta.url))) as {expression: string; date: string; matches: boolean}[];
for (const item of cases) Deno.test(`UTC cron ${item.expression} at ${item.date}`, () => {
    if (cronMatchesDate(item.expression, new Date(item.date)) !== item.matches) throw new Error('Cron fixture mismatch');
});
Deno.test('due checks preserve timestamp authority and one-minute catch-up', () => {
    const now = new Date('2026-10-16T09:01:01Z');
    if (!isTriggerDue('0 9 * * *', null, '2026-10-16T08:59:59Z', now)) throw new Error('Missed catch-up');
    if (isTriggerDue('* * * * *', '2026-10-16T09:02:00Z', '2026-10-01', now)) throw new Error('Future timestamp fired');
});
Deno.test('Edge context retains unknown native usage and UTC bounds', async () => {
    const result = await buildScheduleContext(['agent_usage'], async (_table,columns,start,end) => {
        if (!columns.includes('cost_usd,metadata') || start !== '2026-10-15T00:00:00.000Z' || end !== '2026-10-16T00:00:00.000Z') throw new Error('Context query mismatch');
        return [{agent_id:'native',tokens_used:0,cost_usd:null,metadata:{usage_known:false}}];
    },new Date('2026-10-16T09:00:00Z'));
    if (!result.includes('Unknown usage/cost records: 1')) throw new Error('Unknown usage was hidden');
});
