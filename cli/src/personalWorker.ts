// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  executeExternal,
  parseExecution,
  type ExternalExecution,
  type ExternalResult,
} from '@crewformhq/agent-runtime'

export interface DeviceConfig {
  deviceId: string
  workspaceId: string
  runtime: string
  expiresAt: string
  apiUrl: string
  directory: string
  credential?: string
  keychain?: boolean
}
export interface PersonalJob {
  id: string
  attemptId: string
  runtime: string
  execution: ExternalExecution
  model: string
  systemPrompt: string
  prompt: string
  attachments: { id: string; size: number; type: string }[]
}
const dir = join(homedir(), '.crewform')
const configFile = join(dir, 'device.json')
const service = 'crewform-personal-worker'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const secret = /^[A-Za-z0-9_-]{43}$/
const rotationFile = join(dir, 'device-rotation.json')
function privateFile(path: string) {
  const stat = lstatSync(path)
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))
  )
    throw new Error('Device config must be a private file owned by you.')
}
function privateDirectory(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o700 })
  const stat = lstatSync(path)
  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))
  )
    throw new Error('Worker directory must be owned by you, private (0700), and not a symlink.')
  return realpathSync(path)
}
function readKeychain(id: string) {
  return execFileSync('security', ['find-generic-password', '-a', id, '-s', service, '-w'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}
export function saveDevice(config: DeviceConfig, credential: string) {
  if (
    !uuid.test(config.deviceId) ||
    !uuid.test(config.workspaceId) ||
    !secret.test(credential) ||
    !Number.isFinite(Date.parse(config.expiresAt))
  )
    throw new Error('Invalid device configuration')
  endpoint(config.apiUrl)
  privateDirectory(config.directory)
  privateDirectory(dir)
  let keychain = false
  if (process.platform === 'darwin') {
    try {
      // Interactive stdin keeps the credential out of process arguments.
      execFileSync('security', ['-i'], {
        input: `add-generic-password -U -a ${config.deviceId} -s ${service} -w ${credential}\n`,
        stdio: ['pipe', 'ignore', 'ignore'],
      })
      keychain = readKeychain(config.deviceId) === credential
    } catch {
      /* Documented private-file fallback when keychain is unavailable. */
    }
  }
  const temporary = configFile + '.' + randomBytes(12).toString('hex') + '.new'
  writeFileSync(
    temporary,
    JSON.stringify(
      { ...config, keychain, credential: keychain ? undefined : credential },
      null,
      2,
    ) + '\n',
    { mode: 0o600, flag: 'wx' },
  )
  renameSync(temporary, configFile)
  return keychain
}
export function loadDevice(): { config: DeviceConfig; credential: string } {
  privateFile(configFile)
  const config = JSON.parse(readFileSync(configFile, 'utf8')) as DeviceConfig
  if (!uuid.test(config.deviceId) || !uuid.test(config.workspaceId))
    throw new Error('Invalid device configuration')
  const credential = config.keychain ? readKeychain(config.deviceId) : config.credential
  if (!credential || !secret.test(credential))
    throw new Error('Device credential unavailable; reconnect through the dashboard.')
  return { config, credential }
}
function endpoint(base: string) {
  const url = new URL(base)
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw new Error('Use an HTTPS API origin (HTTP is supported only for loopback testing).')
  url.pathname = url.pathname.replace(/\/$/, '') + '/functions/v1/personal-worker'
  return url
}
export class PersonalClient {
  constructor(
    readonly apiUrl: string,
    private credential?: string,
  ) {
    endpoint(apiUrl)
  }
  async request<T>(body: Record<string, unknown>, binary = false): Promise<T> {
    const response = await fetch(endpoint(this.apiUrl), {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: {
        'Content-Type': 'application/json',
        ...(this.credential ? { 'X-CrewForm-Device': this.credential } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(
        `Personal worker request rejected (${response.status}). Check grant, cancellation, lease or expiry.`,
      )
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Empty worker response')
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.length
        if (total > (binary ? 10_485_760 : 1_048_576)) {
          await reader.cancel()
          throw new Error('Worker response exceeds limit')
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
    const bytes = Buffer.concat(chunks)
    return (binary ? bytes : JSON.parse(bytes.toString('utf8'))) as T
  }
}

export async function connectDevice(options: {
  runtime: string
  name?: string
  apiUrl: string
  appUrl: string
  directory?: string
}) {
  if (existsSync(configFile))
    throw new Error(
      'A device is already configured. Disconnect or revoke it in Settings → Personal devices first.',
    )
  const [agent, transport] = options.runtime.split(':')
  parseExecution({ execution: { kind: 'external', agent, transport } })
  const directory = privateDirectory(options.directory ?? join(dir, 'worker-jobs'))
  const proof = randomBytes(32).toString('base64url'),
    credential = randomBytes(32).toString('base64url')
  const client = new PersonalClient(options.apiUrl)
  const pairing = await client.request<{ pairingId: string; code: string }>({
    action: 'pair',
    proof,
    name: options.name ?? hostname(),
    runtime: options.runtime,
  })
  const app = new URL('/settings/personal-devices', options.appUrl)
  if (app.protocol !== 'https:' && app.hostname !== 'localhost')
    throw new Error('Use an HTTPS approval page')
  app.searchParams.set('code', pairing.code)
  console.log(
    `Approve this device in CrewForm: ${app}\nPairing code: ${pairing.code}\nRuntime: ${options.runtime}\nPrivate job directory: ${directory}\nOnly approve a pairing you initiated. This grant lasts 30 days.`,
  )
  const deadline = Date.now() + 600_000
  while (Date.now() < deadline) {
    await sleep(3000)
    const result = await client.request<{
      pending?: boolean
      deviceId: string
      workspaceId: string
      runtime: string
      expiresAt: string
    }>({ action: 'exchange', pairingId: pairing.pairingId, proof, credential })
    if (result.pending) continue
    if (result.runtime !== options.runtime)
      throw new Error('Approved runtime differs from the requested runtime')
    const keychain = saveDevice({ ...result, apiUrl: options.apiUrl, directory }, credential)
    console.log(
      `Device connected. Credential stored ${keychain ? 'in the OS keychain' : 'in a private 0600 file'}. Start with: crewform worker start`,
    )
    return
  }
  throw new Error('Pairing expired; start connect again.')
}

type Executor = (
  execution: ExternalExecution,
  input: Parameters<typeof executeExternal>[1],
) => Promise<ExternalResult>
/** Cloud input never chooses executable paths, environment variables or cwd. */
export async function executePersonalJob(
  client: Pick<PersonalClient, 'request'>,
  config: Pick<DeviceConfig, 'runtime' | 'directory'>,
  job: PersonalJob,
  signal?: AbortSignal,
  execute: Executor = executeExternal,
) {
  const execution = parseExecution({ execution: job.execution })
  if (
    !execution ||
    job.runtime !== config.runtime ||
    `${execution.agent}:${execution.transport}` !== config.runtime ||
    !uuid.test(job.id) ||
    !uuid.test(job.attemptId) ||
    typeof job.prompt !== 'string' ||
    Buffer.byteLength(job.prompt) > 24000 ||
    typeof job.systemPrompt !== 'string' ||
    Buffer.byteLength(job.systemPrompt) > 20000 ||
    !Array.isArray(job.attachments) ||
    job.attachments.length > 5 ||
    job.attachments.some((f) => !Number.isInteger(f.size) || f.size < 0 || f.size > 10_485_760) ||
    job.attachments.reduce((sum, f) => sum + f.size, 0) > 20_971_520
  )
    throw new Error('Unapproved runtime or invalid personal job')
  const root = privateDirectory(config.directory)
  const cwd = await mkdtemp(join(root, 'job-'))
  const files: string[] = []
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  const identity = { taskId: job.id, attemptId: job.attemptId }
  let heartbeatPending = false,
    writing = false,
    text = '',
    lastSent = '',
    sequence = 0
  const heartbeat = async () => {
    if (heartbeatPending) return
    heartbeatPending = true
    try {
      await client.request({ action: 'heartbeat', ...identity })
    } catch {
      controller.abort()
    } finally {
      heartbeatPending = false
    }
  }
  const flush = async () => {
    if (writing || text === lastSent || controller.signal.aborted) return
    writing = true
    const snapshot = text
    try {
      await client.request({
        action: 'write',
        ...identity,
        sequence: ++sequence,
        text: snapshot,
        outcome: 'stream',
      })
      lastSent = snapshot
    } catch {
      controller.abort()
    } finally {
      writing = false
    }
  }
  const heartbeatTimer = setInterval(() => {
    void heartbeat()
  }, 3000)
  const streamTimer = setInterval(() => {
    void flush()
  }, 5000)
  const timeout = setTimeout(abort, 600_000)
  try {
    await heartbeat()
    controller.signal.throwIfAborted()
    for (const [index, file] of job.attachments.entries()) {
      controller.signal.throwIfAborted()
      const bytes = await client.request<Buffer>(
        { action: 'attachment', ...identity, fileId: file.id },
        true,
      )
      if (bytes.length !== file.size) throw new Error('Attachment size changed')
      const extension =
        (
          {
            'text/plain': 'txt',
            'text/markdown': 'md',
            'application/pdf': 'pdf',
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'application/json': 'json',
            'text/csv': 'csv',
          } as Record<string, string>
        )[file.type] ?? 'bin'
      const path = join(cwd, `input-${index + 1}.${extension}`)
      await writeFile(path, bytes, { mode: 0o600, flag: 'wx' })
      files.push(path)
    }
    const result = await execute(
      { ...execution, timeoutMs: Math.min(execution.timeoutMs ?? 300_000, 600_000) },
      {
        cwd,
        prompt:
          job.prompt +
          (files.length
            ? '\n\nSupplied input files in this private job directory: ' +
              files.map((p) => p.slice(cwd.length + 1)).join(', ')
            : ''),
        systemPrompt: job.systemPrompt,
        model: job.model,
        signal: controller.signal,
        onChunk: (chunk) => {
          text += chunk
          if (Buffer.byteLength(text) > 524288) controller.abort()
        },
      },
    )
    if (Buffer.byteLength(result.result) > 524288)
      throw new Error('Personal result exceeds upload limit')
    clearInterval(streamTimer)
    // A pending snapshot finishes before the final sequence is published.
    while (writing) await sleep(20)
    await heartbeat()
    controller.signal.throwIfAborted()
    await client.request({
      action: 'write',
      ...identity,
      sequence: ++sequence,
      text: result.result,
      outcome: 'completed',
    })
  } catch (error) {
    if (!controller.signal.aborted) {
      clearInterval(streamTimer)
      while (writing) await sleep(20)
      await client
        .request({
          action: 'write',
          ...identity,
          sequence: ++sequence,
          text: 'Personal agent failed',
          outcome: 'failed',
        })
        .catch(() => {})
    }
    throw error
  } finally {
    clearInterval(heartbeatTimer)
    clearInterval(streamTimer)
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
    for (const path of files) await unlink(path).catch(() => {})
    // Never recursively delete files an installed adapter may have created.
    await rmdir(cwd).catch(() => {
      console.error(`Adapter-created files retained in private job directory: ${cwd}`)
    })
  }
}

export async function startPersonalWorker() {
  if (existsSync(rotationFile))
    throw new Error(
      'Credential rotation needs recovery. Run crewform worker rotate before starting.',
    )
  const { config, credential } = loadDevice()
  if (Date.parse(config.expiresAt) <= Date.now())
    throw new Error('Grant expired. Revoke the old device and connect again.')
  privateDirectory(config.directory)
  const client = new PersonalClient(config.apiUrl, credential)
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  console.log(
    `Personal worker ${config.deviceId} · ${config.runtime}. Only your approved single-agent jobs can run here.`,
  )
  try {
    while (!controller.signal.aborted) {
      const { job } = await client.request<{ job: PersonalJob | null }>({ action: 'claim' })
      if (job) {
        try {
          await executePersonalJob(client, config, job, controller.signal)
          console.log(`Completed ${job.id}`)
        } catch {
          console.error(`Stopped ${job.id}; check account, cancellation or lease. No API fallback.`)
        }
      }
      await sleep(3000, undefined, { signal: controller.signal })
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}

export async function disconnectDevice(forget = false) {
  const { config, credential } = loadDevice()
  if (!forget) await new PersonalClient(config.apiUrl, credential).request({ action: 'disconnect' })
  if (existsSync(rotationFile)) {
    privateFile(rotationFile)
    unlinkSync(rotationFile)
  }
  unlinkSync(configFile)
  if (config.keychain && process.platform === 'darwin')
    try {
      execFileSync('security', ['delete-generic-password', '-a', config.deviceId, '-s', service], {
        stdio: 'ignore',
      })
    } catch {
      /* Already revoked server-side. */
    }
  console.log(
    forget
      ? 'Local credential removed. Revoke this device in Settings → Personal devices to stop its Cloud grant.'
      : 'Personal device revoked and local credential removed.',
  )
}
export async function rotateDeviceCredential() {
  const { config, credential } = loadDevice()
  privateDirectory(dir)
  let replacement: string
  if (existsSync(rotationFile)) {
    privateFile(rotationFile)
    const pending = JSON.parse(readFileSync(rotationFile, 'utf8')) as {
      deviceId: string
      credential: string
    }
    if (pending.deviceId !== config.deviceId || !secret.test(pending.credential))
      throw new Error('Invalid rotation recovery file')
    replacement = pending.credential
  } else {
    replacement = randomBytes(32).toString('base64url')
    // Retain the prospective credential before the server can rotate it.
    writeFileSync(
      rotationFile,
      JSON.stringify({ deviceId: config.deviceId, credential: replacement }),
      { mode: 0o600, flag: 'wx' },
    )
  }
  let rotated = false
  try {
    const status = await new PersonalClient(config.apiUrl, replacement).request<{
      deviceId: string
    }>({ action: 'status' })
    rotated = status.deviceId === config.deviceId
  } catch {
    /* The old credential may still be active; retry the same rotation. */
  }
  if (!rotated)
    await new PersonalClient(config.apiUrl, credential).request({
      action: 'rotate',
      credential: replacement,
    })
  saveDevice(config, replacement)
  unlinkSync(rotationFile)
  console.log('Device credential rotated. Grant expiry and approved agents are unchanged.')
}
