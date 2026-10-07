// SPDX-License-Identifier: AGPL-3.0-or-later
import type { IncomingMessage } from 'http';
export class HttpInputError extends Error {
    constructor(message: string, readonly status = 400) { super(message); }
}
/** Shared memory and time bounds, including unauthenticated protocol input. */
export function readBody(req: IncomingMessage, maxBytes = 1_048_576, timeoutMs = 10_000): Promise<string> {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks: Buffer[] = [];
        const cleanup = () => {
            clearTimeout(timer);
            req.off('data', data); req.off('end', end); req.off('error', error); req.off('aborted', aborted);
        };
        const error = (err: Error) => { cleanup(); req.pause(); reject(err); };
        const aborted = () => error(new HttpInputError('Request disconnected'));
        const data = (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) return error(new HttpInputError('Request body too large', 413));
            chunks.push(Buffer.from(chunk));
        };
        const end = () => { cleanup(); resolve(Buffer.concat(chunks).toString('utf8')); };
        const timer = setTimeout(() => error(new HttpInputError('Request body timeout', 408)), timeoutMs);
        req.on('data', data); req.once('end', end); req.once('error', error); req.once('aborted', aborted);
        if (Number(req.headers['content-length'] ?? 0) > maxBytes) error(new HttpInputError('Request body too large', 413));
    });
}
export function boundedJson(raw: string): Record<string, unknown> {
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpInputError('JSON object required');
    return body as Record<string, unknown>;
}
