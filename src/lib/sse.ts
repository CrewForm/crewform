// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

/** Read bounded SSE frames. Returning true stops consumption at a terminal event. */
export async function consumeSse(
    body: ReadableStream<Uint8Array>,
    onData: (data: string) => boolean,
    signal: AbortSignal,
): Promise<boolean> {
    const reader = body.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: true })
    const limit = 64 * 1024
    let line = '', data: string[] = [], size = 0, previousCr = false
    let terminal = false
    const dispatch = () => {
        if (data.length) terminal = onData(data.join('\n'))
        data = []; size = 0
    }
    const finishLine = () => {
        if (!line) dispatch()
        else if (line === 'data' || line.startsWith('data:')) {
            let value = line.slice(5)
            if (value.startsWith(' ')) value = value.slice(1)
            size += value.length + 1
            if (size > limit) throw new Error('SSE frame exceeds the size limit.')
            data.push(value)
        }
        line = ''
    }
    const feed = (text: string) => {
        for (const char of text) {
            if (terminal) break
            if (char === '\n' && previousCr) { previousCr = false; continue }
            previousCr = char === '\r'
            if (char === '\r' || char === '\n') finishLine()
            else {
                line += char
                if (line.length > limit) throw new Error('SSE line exceeds the size limit.')
            }
        }
    }
    const abort = () => { void reader.cancel().catch(() => undefined) }
    signal.addEventListener('abort', abort, { once: true })
    try {
        signal.throwIfAborted()
        // The callback updates terminal while decoding each chunk.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (!terminal) {
            const { done, value } = await reader.read()
            signal.throwIfAborted()
            if (done) {
                feed(decoder.decode())
                // Accept a final frame without a trailing blank line.
                if (line) finishLine()
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (!terminal && data.length) dispatch()
                break
            }
            feed(decoder.decode(value, { stream: true }))
        }
        return terminal
    } finally {
        signal.removeEventListener('abort', abort)
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
    }
}
