// SPDX-License-Identifier: MIT
import { act, renderHook, waitFor, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAgentStream } from './useAgentStream'

afterEach(() => {cleanup(); vi.unstubAllGlobals()})
const encoder = new TextEncoder()
function stream() {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({start(value) {controller = value}})
    return {body, send: (type: string, data = {}) => controller.enqueue(encoder.encode(`data:${JSON.stringify({type, timestamp: 1, ...data})}\n\n`)),
        close: () => controller.close(), fail: () => controller.error(new Error('socket lost'))}
}
function connect(body: ReadableStream<Uint8Array>) {
    const fetch = vi.fn().mockResolvedValue(new Response(body, {headers: {'content-type': 'text/event-stream'}}))
    vi.stubGlobal('fetch', fetch)
    return {fetch, ...renderHook(() => useAgentStream('https://runner.example', 'agent', 'task', 'token', true))}
}

it.each(['eof', 'network'])('preserves partial output and marks %s as interrupted without replay', async kind => {
    const source = stream(), hook = connect(source.body)
    await waitFor(() => expect(hook.result.current.status).toBe('streaming'))
    act(() => source.send('TEXT_MESSAGE_CONTENT', {delta: 'partial evidence'}))
    await waitFor(() => expect(hook.result.current.textContent).toBe('partial evidence'))
    act(() => {if (kind === 'eof') source.close(); else source.fail()})
    await waitFor(() => expect(hook.result.current.status).toBe('interrupted'))
    expect(hook.result.current.textContent).toBe('partial evidence')
    expect(hook.result.current.error).toMatch(/may still be running/)
    expect(hook.fetch).toHaveBeenCalledTimes(1)
})

it('handles chunked UTF-8, multiline data, CRLF and an unterminated final frame', async () => {
    const text = `:keepalive\r\ndata: {"type":"TEXT_MESSAGE_CONTENT",\r\ndata: "timestamp":1,"delta":"café 🚀"}\r\n\r\ndata:{"type":"RUN_FINISHED","timestamp":2}`
    const bytes = encoder.encode(text)
    const hook = connect(new ReadableStream({start(controller) {for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close()}}))
    await waitFor(() => expect(hook.result.current.status).toBe('completed'))
    expect(hook.result.current.textContent).toBe('café 🚀')
    expect(hook.result.current.events).toHaveLength(2)
})

it('distinguishes runner execution failure from connection loss and clears approvals', async () => {
    const source = stream(), hook = connect(source.body)
    await waitFor(() => expect(hook.result.current.status).toBe('streaming'))
    act(() => {
        source.send('INTERACTION_REQUEST', {interactionId: 'approve', interactionType: 'approval', title: 'Proceed?', timeoutMs: 5000})
        source.send('RUN_ERROR', {error: 'Provider refused the request'})
    })
    await waitFor(() => expect(hook.result.current.status).toBe('error'))
    expect(hook.result.current.error).toBe('Provider refused the request')
    expect(hook.result.current.pendingInteraction).toBeNull()
})

it('rejects malformed events, mismatched task identities and oversized frames', async () => {
    for (const data of ['{bad json}', '{"type":"RUN_FINISHED","timestamp":1,"threadId":"other"}', 'x'.repeat(65537)]) {
        const hook = connect(new ReadableStream({start(controller) {controller.enqueue(encoder.encode(`data:${data}\n\n`)); controller.close()}}))
        await waitFor(() => expect(hook.result.current.status).toBe('interrupted'))
        hook.unmount()
    }
})

it('cancels obsolete connections and fences late responses after task changes', async () => {
    let resolveOld!: (value: Response) => void
    const source = stream()
    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => {resolveOld = resolve}))
        .mockResolvedValueOnce(new Response(source.body)))
    const hook = renderHook(({task}) => useAgentStream('https://runner.example', 'agent', task, 'token', true), {initialProps: {task: 'old'}})
    hook.rerender({task: 'new'})
    await waitFor(() => expect(hook.result.current.status).toBe('streaming'))
    act(() => source.send('TEXT_MESSAGE_CONTENT', {delta: 'new task'}))
    await waitFor(() => expect(hook.result.current.textContent).toBe('new task'))
    await act(async () => {resolveOld(new Response('data:{"type":"RUN_ERROR","timestamp":1,"message":"old failure"}\n\n')); await Promise.resolve()})
    expect(hook.result.current.textContent).toBe('new task')
    expect(hook.result.current.status).toBe('streaming')
    hook.unmount()
})

it('does not report rejected interaction submissions as successful', async () => {
    const hook = connect(new ReadableStream({start(controller) {controller.enqueue(encoder.encode('data:{"type":"RUN_FINISHED","timestamp":1}\n\n')); controller.close()}}))
    await waitFor(() => expect(hook.result.current.status).toBe('completed'))
    hook.fetch.mockResolvedValueOnce(new Response('{}', {status: 409}))
    await expect(hook.result.current.respond({interactionId: 'expired', approved: true})).rejects.toThrow(/409/)
})
