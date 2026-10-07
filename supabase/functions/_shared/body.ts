// SPDX-License-Identifier: AGPL-3.0-or-later
/** Bounds Edge Function JSON before schema validation. */
export async function readText(req: Request, maxBytes = 1_048_576): Promise<string> {
    if (Number(req.headers.get('content-length') ?? 0) > maxBytes) throw new Error('Request body too large');
    const reader = req.body?.getReader();
    if (!reader) throw new Error('JSON body required');
    let size = 0;
    const chunks: Uint8Array[] = [];
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); void reader.cancel(); }, 10_000);
    try {
        while (true) {
            const {done, value} = await reader.read();
            if (controller.signal.aborted) throw new Error('Request body timeout');
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) { await reader.cancel(); throw new Error('Request body too large'); }
            chunks.push(value);
        }
        const buffer = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
        return new TextDecoder().decode(buffer);
    } finally { clearTimeout(timer); reader.releaseLock(); }
}

export async function readJson(req: Request, maxBytes = 1_048_576): Promise<Record<string, unknown>> {
    const body: unknown = JSON.parse(await readText(req,maxBytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('JSON object required');
    return body as Record<string, unknown>;
}
