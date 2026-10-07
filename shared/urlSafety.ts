// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, type Dispatcher } from 'undici';

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

// DNS is checked at socket creation too, closing the validation/connection gap.
export const publicNetworkDispatcher = new Agent({ connect: {
    lookup: (hostname, options, callback) => {
        void lookup(hostname, { all: true, verbatim: true }).then(addresses => {
            if (!addresses.length || addresses.some(entry => isBlockedIp(entry.address))) {
                callback(new Error('Connection resolves to a private or reserved network'), '', 4); return;
            }
            const family = typeof options === 'object' ? options.family : options;
            const candidates = family ? addresses.filter(entry => entry.family === family) : addresses;
            if (!candidates.length) { callback(new Error('No public address for requested family'), '', 4); return; }
            if (typeof options === 'object' && options.all) callback(null, candidates as never, undefined as never);
            else callback(null, candidates[0].address, candidates[0].family);
        }).catch(error => callback(error instanceof Error ? error : new Error('DNS failed'), '', 4));
    },
} });


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

    // Restrict to global unicast. This rejects mapped/compatible IPv4, NAT64
    // and local/reserved transition ranges instead of misparsing hex-mapped IPs.
    return !/^[23][0-9a-f]{3}:/.test(normalized) || normalized.startsWith('2002:');
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

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
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
    let request = { ...init, headers: new Headers(init.headers) };
    const signal = timeoutMs > 0
        ? (init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs))
        : init.signal;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
        const response = await fetch(current, { ...request, redirect: 'manual', signal, dispatcher: publicNetworkDispatcher } as RequestInit & {dispatcher: Dispatcher});
        if (![301, 302, 303, 307, 308].includes(response.status)) return boundResponse(response);
        const location = response.headers.get('location');
        if (!location) return response;
        await response.body?.cancel();
        if (redirectCount === MAX_REDIRECTS) throw new Error('Too many redirects');
        const next = await validateExternalUrl(new URL(location, current).toString());
        if (current.protocol === 'https:' && next.protocol !== 'https:') throw new Error('HTTPS downgrade redirect denied');
        if (next.origin !== current.origin) {
            // Custom headers may carry secrets too. A body may contain private data.
            const publicHeaders = new Set(['accept', 'accept-language', 'user-agent', 'accept-encoding']);
            if ([...request.headers.keys()].some(name => !publicHeaders.has(name)) || request.body != null || request.credentials === 'include') {
                throw new Error('Cross-origin redirect of authenticated or sensitive request denied');
            }
        }
        const method = (request.method ?? 'GET').toUpperCase();
        if ((response.status === 303 && method !== 'HEAD') || ([301, 302].includes(response.status) && method === 'POST')) {
            request = { ...request, method: 'GET', body: undefined, headers: new Headers(request.headers) };
            request.headers.delete('content-type');
            request.headers.delete('content-length');
        }
        current = next;
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

/** Stream without accumulating data; terminate unbounded remote responses. */
export function boundResponse(response: Response, maxBytes=8_388_608): Response {
    if(!response.body) return response;
    let bytes=0;
    const bounded=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>maxBytes) throw new Error('Remote response exceeds limit');controller.enqueue(chunk);}}));
    const result=new Response(bounded,{status:response.status,statusText:response.statusText,headers:response.headers});
    Object.defineProperty(result,'url',{value:response.url});
    return result;
}

/** Preserve SDK Request bodies, headers and cancellation when guarding MCP. */
export async function safeFetchInput(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const request=new Request(input,init);
    const body=request.body ? await request.text() : undefined;
    if(body && Buffer.byteLength(body)>1_048_576) throw new Error('Remote request exceeds input limit');
    return safeFetch(request.url,{method:request.method,headers:request.headers,body,signal:request.signal,credentials:request.credentials},120_000);
}
