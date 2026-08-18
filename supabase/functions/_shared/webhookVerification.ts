// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

export function constantTimeEqual(left: string, right: string): boolean {
    const a = new TextEncoder().encode(left);
    const b = new TextEncoder().encode(right);
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
    return difference === 0;
}

export async function hmacHex(algorithm: 'SHA-1' | 'SHA-256', secret: string, value: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: algorithm }, false, ['sign'],
    );
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hmacBase64(algorithm: 'SHA-1' | 'SHA-256', secret: string, value: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: algorithm }, false, ['sign'],
    );
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
    let binary = '';
    for (const byte of digest) binary += String.fromCharCode(byte);
    return btoa(binary);
}
