// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

const VERSION = 'v1';

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
    const binary = atob(value);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function getKeyBytes(): Uint8Array {
    const configured = Deno.env.get('API_KEY_ENCRYPTION_KEY');
    if (!configured) throw new Error('API_KEY_ENCRYPTION_KEY is not configured');

    const bytes = /^[0-9a-f]{64}$/i.test(configured)
        ? Uint8Array.from(configured.match(/.{2}/g)!.map(byte => Number.parseInt(byte, 16)))
        : base64ToBytes(configured);
    if (bytes.byteLength !== 32) throw new Error('API_KEY_ENCRYPTION_KEY must decode to exactly 32 bytes');
    return bytes;
}

async function importKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', getKeyBytes(), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function isEncryptedSecret(value: string): boolean {
    return value.startsWith(`${VERSION}:`);
}

export async function encryptSecret(plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        await importKey(),
        new TextEncoder().encode(plaintext),
    );
    return `${VERSION}:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string): Promise<string> {
    if (!isEncryptedSecret(value)) return value;
    const [, ivValue, ciphertextValue] = value.split(':');
    if (!ivValue || !ciphertextValue) throw new Error('Malformed encrypted secret');
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(ivValue) },
        await importKey(),
        base64ToBytes(ciphertextValue),
    );
    return new TextDecoder().decode(plaintext);
}

export async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
