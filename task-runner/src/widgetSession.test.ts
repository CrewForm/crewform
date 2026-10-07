// SPDX-License-Identifier: AGPL-3.0-or-later
import {afterEach,it,expect,vi} from 'vitest';
import {issueVisitorToken,verifyVisitorToken} from './widgetSession';
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
it('binds an unguessable history credential to one widget and rejects caller-chosen IDs',()=>{
 vi.stubEnv('WIDGET_SESSION_SECRET','fixture-only');const token=issueVisitorToken('one');
 expect(verifyVisitorToken('one',token)).toBe(true);expect(verifyVisitorToken('two',token)).toBe(false);
 expect(verifyVisitorToken('one','known-visitor')).toBe(false);
 expect(verifyVisitorToken('one',token.slice(0,-2)+'00')).toBe(false);
});
it('expires history credentials and invalidates them after signing key rotation',()=>{
 vi.useFakeTimers();vi.stubEnv('WIDGET_SESSION_SECRET','fixture-only');const token=issueVisitorToken('one');
 vi.stubEnv('WIDGET_SESSION_SECRET','rotated-fixture');expect(verifyVisitorToken('one',token)).toBe(false);
 vi.stubEnv('WIDGET_SESSION_SECRET','fixture-only');vi.advanceTimersByTime(31*86400000);expect(verifyVisitorToken('one',token)).toBe(false);
});
