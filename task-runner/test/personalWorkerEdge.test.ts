// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi } from 'vitest'
import {
  personalWorkerHandler,
  personalBackendFetch,
} from '../../supabase/functions/_shared/personalWorker'
const uuid = '11111111-1111-4111-8111-111111111111'
function fixture() {
  const rpc = vi.fn(async () => ({ data: null as unknown, error: null as unknown }))
  const download = vi.fn(async () => ({ data: new Blob(['hello']), error: null }))
  return {
    rpc,
    download,
    handler: personalWorkerHandler({ rpc, storage: { from: () => ({ download }) } }),
  }
}
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://control.test/functions/v1/personal-worker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}
describe('personal worker Edge boundary', () => {
  it('hashes proof and address before persisting an unauthenticated challenge', async () => {
    const f = fixture()
    f.rpc.mockResolvedValueOnce({ data: uuid, error: null })
    const response = await f.handler(
      request(
        { action: 'pair', proof: 'a'.repeat(43), name: 'Laptop', runtime: 'codex:cli' },
        { 'x-real-ip': '203.0.113.5' },
      ),
    )
    expect(response.status).toBe(200)
    expect((await response.json()).code).toMatch(/^[A-Z2-9]{10}$/)
    expect(f.rpc.mock.calls[0][1].p_proof_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(f.rpc.mock.calls)).not.toContain('203.0.113.5')
    expect(JSON.stringify(f.rpc.mock.calls)).not.toContain('a'.repeat(43))
  })
  it('rejects workspace service keys and missing device credentials before RPC', async () => {
    const f = fixture()
    expect(
      (await f.handler(request({ action: 'claim' }, { 'x-api-key': 'workspace-key' }))).status,
    ).toBe(401)
    expect(f.rpc).not.toHaveBeenCalled()
  })
  it('rejects cloud executable, filesystem and environment fields', async () => {
    const f = fixture()
    const headers = { 'x-crewform-device': 'b'.repeat(43) }
    for (const extra of [{ cwd: '/etc' }, { command: 'sh' }, { env: { KEY: 'secret' } }])
      expect(
        (
          await f.handler(
            request({ action: 'heartbeat', taskId: uuid, attemptId: uuid, ...extra }, headers),
          )
        ).status,
      ).toBe(409)
    expect(f.rpc).not.toHaveBeenCalled()
  })
  it('never returns backend secrets in rejection bodies', async () => {
    const f = fixture()
    f.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private-password' } })
    const response = await f.handler(
      request({ action: 'claim' }, { 'x-crewform-device': 'b'.repeat(43) }),
    )
    expect(response.status).toBe(409)
    expect(await response.text()).not.toContain('private-password')
  })
  it('binds downloads to the file, task and attempt and rechecks before exposing bytes', async () => {
    const f = fixture()
    f.rpc.mockResolvedValue({
      data: { path: 'approved/private/object', size: 5, type: 'text/plain' },
      error: null,
    })
    const response = await f.handler(
      request(
        { action: 'attachment', taskId: uuid, attemptId: uuid, fileId: uuid },
        { 'x-crewform-device': 'b'.repeat(43) },
      ),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('hello')
    expect(f.rpc).toHaveBeenCalledTimes(2)
    expect(f.rpc.mock.calls[0][1]).toMatchObject({ p_task: uuid, p_attempt: uuid, p_file: uuid })
  })
  it('denies oversized JSON and output sequences', async () => {
    const f = fixture()
    expect((await f.handler(request({ action: 'claim', data: 'x'.repeat(600001) }))).status).toBe(
      409,
    )
    expect(
      (
        await f.handler(
          request(
            {
              action: 'write',
              taskId: uuid,
              attemptId: uuid,
              sequence: 257,
              text: 'x',
              outcome: 'completed',
            },
            { 'x-crewform-device': 'b'.repeat(43) },
          ),
        )
      ).status,
    ).toBe(409)
    expect(f.rpc).not.toHaveBeenCalled()
  })
})

it('bounds backend payloads before the SDK buffers them and disables redirects', async () => {
  const fetcher = vi.fn(async (_input: unknown, init?: RequestInit) => {
    expect(init?.redirect).toBe('error')
    return new Response('x'.repeat(1_048_577))
  })
  const bounded = personalBackendFetch(fetcher as typeof fetch)
  await expect(bounded('https://backend.test/rest/v1/rpc/claim_personal_job')).rejects.toThrow(
    'exceeds limit',
  )
  const download = personalBackendFetch((async () => new Response('hello')) as typeof fetch)
  expect(
    await (await download('https://backend.test/storage/v1/object/attachments/file')).text(),
  ).toBe('hello')
})
