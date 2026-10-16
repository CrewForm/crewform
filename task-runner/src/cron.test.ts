// SPDX-License-Identifier: MIT
import {expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {cronMatchesDate, isTriggerDue} from './cron';
const cases = JSON.parse(readFileSync(resolve(__dirname,'cron-cases.json'), 'utf8')) as {expression: string; date: string; matches: boolean}[];
it.each(cases)('UTC cron $expression at $date', ({expression,date,matches}) => {
    expect(cronMatchesDate(expression, new Date(date))).toBe(matches);
});
it('rejects invalid/future timestamps and catches a missed minute without a two-minute gap', () => {
    const now = new Date('2026-10-16T09:01:01Z');
    expect(isTriggerDue('0 9 * * *', null, '2026-10-16T08:59:59Z', now)).toBe(true);
    expect(isTriggerDue('* * * * *', '2026-10-16T09:02:00Z', '2026-10-01', now)).toBe(false);
    expect(isTriggerDue('* * * * *', null, 'invalid', now)).toBe(false);
    expect(isTriggerDue('* * * * *', 'invalid', '2026-10-01', now)).toBe(false);
    expect(isTriggerDue('* * * * *', null, '2026-10-17', now)).toBe(false);
    expect(isTriggerDue('* * * * *', '2026-10-16T09:01:00Z', '2026-10-01', now)).toBe(false);
});
