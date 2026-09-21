// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { describe, expect, it, vi } from 'vitest';
vi.mock('./supabase', () => ({ supabase: {} }));
import { cronMatchesDate, isTriggerDue } from './triggerScheduler';

describe('schedule evaluation', () => {
    it('evaluates UTC regardless of the host local-time getters', () => {
        const date = new Date('2026-09-20T09:00:00Z');
        // Local time could be 10:00 in London; UTC remains 09:00.
        vi.spyOn(date, 'getHours').mockReturnValue(10);
        expect(cronMatchesDate('0 9 * * *', date)).toBe(true);
        expect(cronMatchesDate('0 10 * * *', date)).toBe(false);
    });

    it('does not fire twice in the same minute', () => {
        expect(isTriggerDue('0 9 * * *', '2026-09-20T09:00:02Z',
            '2026-09-01T00:00:00Z', new Date('2026-09-20T09:00:55Z'))).toBe(false);
    });

    it('catches up one missed daily run after a restart', () => {
        expect(isTriggerDue('0 9 * * *', '2026-09-19T09:00:00Z',
            '2026-09-01T00:00:00Z', new Date('2026-09-20T09:08:00Z'))).toBe(true);
    });

    it('uses creation time when a new trigger has never fired', () => {
        expect(isTriggerDue('0 9 * * *', null,
            '2026-09-20T08:00:00Z', new Date('2026-09-20T09:08:00Z'))).toBe(true);
    });

    it('does not replay missed weekly runs older than the catch-up window', () => {
        expect(isTriggerDue('0 9 * * 1', '2026-08-31T09:00:00Z',
            '2026-08-01T00:00:00Z', new Date('2026-09-20T12:00:00Z'))).toBe(false);
    });

    it('does not replay schedules from before creation', () => {
        expect(isTriggerDue('0 9 * * *', null,
            '2026-09-20T10:00:00Z', new Date('2026-09-20T10:08:00Z'))).toBe(false);
    });
});
