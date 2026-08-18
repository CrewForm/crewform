// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

function isBlockedIpv4(address: string): boolean {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b] = parts;
    return a === 0
        || a === 10
        || a === 127
        || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 0)
        || (a === 192 && b === 168)
        || (a === 198 && (b === 18 || b === 19))
        || a >= 224;
}

function isBlockedIp(address: string): boolean {
    const normalized = address.toLowerCase().split('%')[0];
    if (isIP(normalized) === 4) return isBlockedIpv4(normalized);
    if (isIP(normalized) !== 6) return true;

    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    if (normalized.startsWith('ff')) return true;
    if (normalized.startsWith('2001:db8:')) return true;

    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    return mapped ? isBlockedIpv4(mapped[1]) : false;
}

export async function validateExternalUrl(rawUrl: string): Promise<URL> {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new Error('Invalid URL');
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Only HTTP(S) URLs are allowed');
    }
    if (url.username || url.password) throw new Error('URLs containing credentials are not allowed');

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
        throw new Error('Local network destinations are not allowed');
    }
    if (hostname === 'metadata.google.internal' || hostname === 'metadata.azure.internal') {
        throw new Error('Cloud metadata destinations are not allowed');
    }

    if (isIP(hostname)) {
        if (isBlockedIp(hostname)) throw new Error('Private or reserved network destinations are not allowed');
        return url;
    }

    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some(({ address }) => isBlockedIp(address))) {
        throw new Error('Destination resolves to a private or reserved network');
    }
    return url;
}

export async function validateProviderBaseUrl(rawUrl: string): Promise<URL> {
    if (process.env.ALLOW_PRIVATE_PROVIDER_URLS === 'true') {
        const url = new URL(rawUrl);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
            throw new Error('Invalid provider base URL');
        }
        return url;
    }
    return validateExternalUrl(rawUrl);
}

export async function safeFetch(
    rawUrl: string,
    init: RequestInit = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
    let current = await validateExternalUrl(rawUrl);

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
        const response = await fetch(current, {
            ...init,
            redirect: 'manual',
            signal: timeoutMs > 0
                ? (init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs))
                : init.signal,
        });

        if (![301, 302, 303, 307, 308].includes(response.status)) return response;
        const location = response.headers.get('location');
        if (!location) return response;
        if (redirectCount === MAX_REDIRECTS) throw new Error('Too many redirects');
        current = await validateExternalUrl(new URL(location, current).toString());
    }

    throw new Error('Request failed');
}

export async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytesRead = 0;
    let result = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        if (bytesRead > maxBytes) {
            await reader.cancel();
            return `${result}${decoder.decode(value.slice(0, Math.max(0, maxBytes - (bytesRead - value.byteLength))), { stream: false })}\n... (truncated)`;
        }
        result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
}
