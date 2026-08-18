// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { afterEach, describe, expect, it } from 'vitest';
import { decryptApiKey, encryptApiKey, hashApiKey } from './crypto';
import { validateExternalUrl } from './urlSafety';

describe('credential hardening', () => {
    const originalKey = process.env.API_KEY_ENCRYPTION_KEY;

    afterEach(() => {
        if (originalKey === undefined) delete process.env.API_KEY_ENCRYPTION_KEY;
        else process.env.API_KEY_ENCRYPTION_KEY = originalKey;
    });

    it('round-trips AES-256-GCM secrets without storing plaintext', () => {
        process.env.API_KEY_ENCRYPTION_KEY = '11'.repeat(32);
        const encrypted = encryptApiKey('sk-sensitive-value');
        expect(encrypted).toMatch(/^v1:/);
        expect(encrypted).not.toContain('sk-sensitive-value');
        expect(decryptApiKey(encrypted)).toBe('sk-sensitive-value');
    });

    it('uses a stable one-way hash for inbound authentication keys', () => {
        expect(hashApiKey('cf_test')).toBe('3c718f2f38a83d1e98b887241de76b11d78703de50c888922d27105682c3378f');
    });
});

describe('outbound URL hardening', () => {
    it.each([
        'http://127.0.0.1/admin',
        'http://10.0.0.1/',
        'http://169.254.169.254/latest/meta-data',
        'http://[::1]/',
        'file:///etc/passwd',
    ])('rejects private or non-HTTP destination %s', async (url) => {
        await expect(validateExternalUrl(url)).rejects.toThrow();
    });
});
