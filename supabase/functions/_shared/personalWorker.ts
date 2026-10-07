// SPDX-License-Identifier: AGPL-3.0-or-later
import { readJson } from './body.ts'

interface Backend {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
  storage: {
    from(bucket: string): {
      download(path: string): PromiseLike<{ data: Blob | null; error: unknown }>
    }
  }
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const secret = /^[A-Za-z0-9_-]{43}$/
async function hash(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max || !value) throw new Error('Invalid input')
  return value
}
function id(value: unknown): string {
  const v = text(value, 36)
  if (!uuid.test(v)) throw new Error('Invalid identifier')
  return v
}

/** No endpoint accepts user sessions, API keys, executable paths or environments. */
export function personalWorkerHandler(backend: Backend) {
  return async (req: Request): Promise<Response> => {
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
    try {
      const body = await readJson(req, 600_000)
      const action = text(body.action, 30)
      const rpc = async (name: string, args: Record<string, unknown>) => {
        const result = await backend.rpc(name, args)
        if (result.error) throw new Error('Operation rejected')
        return result.data
      }
      if (action === 'pair') {
        if (Object.keys(body).some((k) => !['action', 'proof', 'name', 'runtime'].includes(k)))
          throw new Error('Invalid pairing fields')
        const proof = text(body.proof, 43)
        if (!secret.test(proof)) throw new Error('Invalid proof')
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        const code = [...crypto.getRandomValues(new Uint8Array(10))]
          .map((v) => alphabet[v % alphabet.length])
          .join('')
        const client =
          req.headers.get('x-real-ip') ??
          req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ??
          'unknown'
        const pairingId = await rpc('start_device_pairing', {
          p_proof_hash: await hash(proof),
          p_code: code,
          p_name: text(body.name, 80),
          p_runtime: text(body.runtime, 20),
          p_client_hash: await hash(client),
        })
        return json({ pairingId, code, expiresIn: 600, pollSeconds: 3 })
      }
      if (action === 'exchange') {
        if (
          Object.keys(body).some((k) => !['action', 'pairingId', 'proof', 'credential'].includes(k))
        )
          throw new Error('Invalid exchange fields')
        const proof = text(body.proof, 43),
          credential = text(body.credential, 43)
        if (!secret.test(proof) || !secret.test(credential)) throw new Error('Invalid proof')
        return json(
          await rpc('exchange_device_pairing', {
            p_id: id(body.pairingId),
            p_proof_hash: await hash(proof),
            p_credential_hash: await hash(credential),
          }),
        )
      }
      const token = req.headers.get('x-crewform-device')
      if (!token || !secret.test(token) || req.headers.has('x-api-key'))
        return json({ error: 'Device credential required' }, 401)
      const credentialHash = await hash(token)
      if (action === 'status') {
        if (Object.keys(body).length !== 1) throw new Error('Invalid status fields')
        return json(await rpc('personal_device_status', { p_hash: credentialHash }))
      }
      if (action === 'claim') {
        if (Object.keys(body).length !== 1) throw new Error('Invalid claim fields')
        return json({ job: await rpc('claim_personal_job', { p_hash: credentialHash }) })
      }
      if (action === 'rotate' || action === 'disconnect') {
        if (Object.keys(body).some((k) => !['action', 'credential'].includes(k)))
          throw new Error('Invalid credential fields')
        const replacement = action === 'disconnect' ? '' : text(body.credential, 43)
        if (action === 'rotate' && !secret.test(replacement)) throw new Error('Invalid credential')
        await rpc('rotate_personal_credential', {
          p_hash: credentialHash,
          p_new_hash: replacement ? await hash(replacement) : '',
          p_revoke: action === 'disconnect',
        })
        return json({ ok: true })
      }
      const allowed =
        action === 'write'
          ? ['action', 'taskId', 'attemptId', 'sequence', 'text', 'outcome']
          : action === 'attachment'
            ? ['action', 'taskId', 'attemptId', 'fileId']
            : ['action', 'taskId', 'attemptId']
      if (Object.keys(body).some((k) => !allowed.includes(k))) throw new Error('Invalid job fields')
      const args = {
        p_hash: credentialHash,
        p_task: id(body.taskId),
        p_attempt: id(body.attemptId),
      }
      if (action === 'heartbeat') await rpc('heartbeat_personal_job', args)
      else if (action === 'write') {
        if (
          !Number.isInteger(body.sequence) ||
          Number(body.sequence) < 1 ||
          Number(body.sequence) > 256 ||
          typeof body.text !== 'string'
        )
          throw new Error('Invalid result')
        await rpc('write_personal_job', {
          ...args,
          p_sequence: body.sequence,
          p_text: body.text,
          p_outcome: text(body.outcome, 10),
        })
      } else if (action === 'attachment') {
        const file = (await rpc('personal_job_attachment', {
          ...args,
          p_file: id(body.fileId),
        })) as { path: string; size: number; type: string }
        const result = await backend.storage.from('attachments').download(file.path)
        if (
          result.error ||
          !result.data ||
          result.data.size > 10_485_760 ||
          result.data.size !== file.size
        )
          throw new Error('Attachment unavailable')
        // Check authority again after the download, before exposing bytes.
        await rpc('personal_job_attachment', { ...args, p_file: id(body.fileId) })
        return new Response(result.data, {
          headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' },
        })
      } else return json({ error: 'Unknown action' }, 400)
      return json({ ok: true })
    } catch {
      // SQL/provider error bodies and secrets never enter public responses.
      return json(
        {
          error:
            'Personal worker request rejected; check grant, lease, membership, input or expiry.',
        },
        409,
      )
    }
  }
}

/** Bound trusted backend responses before the SDK turns downloads into blobs. */
export function personalBackendFetch(fetcher: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController()
    const abort = () => controller.abort()
    const caller = init?.signal
    caller?.addEventListener('abort', abort, { once: true })
    if (caller?.aborted) abort()
    const timer = setTimeout(abort, 10_000)
    try {
      const response = await fetcher(input, {
        ...init,
        redirect: 'error',
        signal: controller.signal,
      })
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      )
      const limit = url.pathname.startsWith('/storage/') ? 10_485_760 : 1_048_576
      const reader = response.body?.getReader()
      if (!reader) return response
      const chunks: Uint8Array[] = []
      let total = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.byteLength
          if (total > limit) {
            await reader.cancel()
            throw new Error('Backend response exceeds limit')
          }
          chunks.push(value)
        }
      } finally {
        reader.releaseLock()
      }
      const bytes = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      return new Response(bytes, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    } finally {
      clearTimeout(timer)
      caller?.removeEventListener('abort', abort)
    }
  }
}
