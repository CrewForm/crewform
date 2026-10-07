// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

function isPrivateIpv4(address: string): boolean {
    const octets = address.split('.').map(Number);
    if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 0) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19));
}

function isPrivateIpv6(address: string): boolean {
    const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') ||
        normalized.startsWith('fd') || /^fe[89ab]/.test(normalized) || normalized.startsWith('::ffff:');
}

export async function assertSafeRemoteUrl(value: string): Promise<URL> {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) URLs are allowed');
    if (url.username || url.password) throw new Error('URL credentials are not allowed');
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') ||
        hostname === 'metadata.google.internal' || isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
        throw new Error('Private or reserved network targets are not allowed');
    }
    for (const type of ['A', 'AAAA'] as const) {
        try {
            const addresses = await Deno.resolveDns(hostname, type);
            if (addresses.some(address => isPrivateIpv4(address) || isPrivateIpv6(address))) {
                throw new Error('Hostname resolves to a private or reserved address');
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes('private or reserved')) throw error;
        }
    }
    return url;
}

export async function assertSafeProviderUrl(value: string): Promise<URL> {
    if (Deno.env.get('ALLOW_PRIVATE_PROVIDER_URLS') === 'true') {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
            throw new Error('Invalid provider base URL');
        }
        return url;
    }
    return assertSafeRemoteUrl(value);
}

export async function safeRemoteFetch(value: string, init: RequestInit, provider = false): Promise<Response> {
    if (provider) await assertSafeProviderUrl(value); else await assertSafeRemoteUrl(value);
    const runner = Deno.env.get('TASK_RUNNER_URL');
    const secret = Deno.env.get('WEBHOOK_SECRET');
    if (!runner || !secret) throw new Error('Outbound egress guard is not configured');
    if (init.body !== undefined && typeof init.body !== 'string') throw new Error('Outbound body must be text');
    // No second direct DNS/fetch gap inside the Edge runtime. Credentials and
    // tenant data travel over the operator's trusted backend connection only.
    const response = await fetch(`${runner.replace(/\/$/,'')}/_internal/remote-fetch`, {
        method: 'POST', headers: {'Content-Type':'application/json','x-webhook-secret':secret},
        body: JSON.stringify({url:value,method:init.method,headers:Object.fromEntries(new Headers(init.headers)),body:init.body,provider}),
        redirect:'error', signal:init.signal ?? AbortSignal.timeout(20_000),
    });
    if ([401,403,502,503].includes(response.status)) throw new Error('Outbound egress guard unavailable');
    return response;
}
