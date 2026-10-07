// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Monitor, RefreshCw } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useAgents } from '@/hooks/useAgents'
import { usePersonalDevices } from '@/hooks/usePersonalDevices'
import { deviceRpc } from '@/db/personalDevices'

const field =
  'w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary'
export function PersonalDevicesSettings() {
  const { workspaceId } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [code, setCode] = useState(params.get('code') ?? '')
  const [pairing, setPairing] = useState<{
    name: string
    runtime: string
    expiresAt: string
  } | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [initiated, setInitiated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const { agents, refetch: refetchAgents } = useAgents(workspaceId)
  const devices = usePersonalDevices(workspaceId)
  const eligible = agents.filter((a) => {
    const execution = a.config.execution as
      | { kind?: string; agent?: string; transport?: string }
      | undefined
    return (
      execution?.kind === 'external' &&
      `${execution.agent}:${execution.transport}` === pairing?.runtime
    )
  })
  async function inspect() {
    setBusy(true)
    setError('')
    setNotice('')
    setSelected([])
    setInitiated(false)
    try {
      const refreshed = await refetchAgents()
      if (refreshed.error) throw new Error('Agents unavailable')
      const result = await deviceRpc<{ name: string; runtime: string; expiresAt: string } | null>(
        'inspect_device_pairing',
        { p_code: code.trim() },
      )
      if (!result) throw new Error('Unavailable')
      setPairing(result)
    } catch {
      setPairing(null)
      setError(
        'Device details could not be loaded. Check your code and workspace, then try again. If the code expired, start crewform connect again.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function approve() {
    if (!workspaceId || !initiated || !selected.length) return
    setBusy(true)
    setError('')
    try {
      const id = await deviceRpc<string | null>('approve_device_pairing', {
        p_code: code.trim(),
        p_workspace_id: workspaceId,
        p_agent_ids: selected,
      })
      if (!id) throw new Error('Unavailable')
      setPairing(null)
      setCode('')
      setParams({}, { replace: true })
      setSelected([])
      setNotice(
        'Device approved for 30 days. In each approved agent’s Execution settings, select this device, then start crewform worker start on your laptop.',
      )
      await devices.refetch()
    } catch {
      setError(
        'Approval failed. Check the selected workspace and agent runtimes. Revoke your previous device before pairing another.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function revoke(id: string) {
    setBusy(true)
    setError('')
    try {
      await deviceRpc('revoke_personal_device', { p_id: id })
      setNotice(
        'Device revoked. Active local execution stops on its next authority check, within 9 seconds while the worker is responsive.',
      )
      await devices.refetch()
    } catch {
      setError('Revocation failed. Refresh and try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-100">Personal devices</h1>
        <p className="text-sm leading-relaxed text-gray-400">
          Run your own Cloud tasks through an installed agent’s login on your laptop. Provider
          logins stay on that device. A device can run only your approved single-agent jobs.
        </p>
      </header>
      <section className="space-y-4" aria-labelledby="pair-device-title">
        <h2 id="pair-device-title" className="text-lg font-medium text-gray-200">
          Connect your laptop
        </h2>
        <p className="text-sm text-gray-400">
          Run this locally after signing in to the native agent:
        </p>
        <pre className="bg-surface-card overflow-x-auto rounded-lg p-4 text-sm text-gray-200">
          <code>npx @crewformhq/cli@0.2.0 connect --runtime codex:cli</code>
        </pre>
        <p className="text-sm text-gray-400">
          Use <code>claude:cli</code> or a supported <code>agent:acp</code> runtime as needed. One
          device per user, with a 30-day grant.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex-1 space-y-1.5 text-sm text-gray-300">
            Pairing code
            <input
              className={field}
              value={code}
              autoComplete="off"
              maxLength={11}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                setPairing(null)
              }}
              placeholder="Code from your terminal"
            />
          </label>
          <button
            type="button"
            disabled={busy || code.replace('-', '').length !== 10}
            className="border-border hover:bg-surface-elevated focus-visible:outline-brand-primary self-end rounded-lg border px-4 py-2.5 text-sm text-gray-200 focus-visible:outline disabled:opacity-50"
            onClick={() => void inspect()}
          >
            Review device
          </button>
        </div>
        {pairing && (
          <div className="border-border space-y-4 rounded-lg border p-4">
            <p className="text-sm text-gray-200">
              <strong>{pairing.name}</strong> · {pairing.runtime}
            </p>
            <p className="text-sm text-gray-400">
              Check this name and code against the terminal on your laptop. Approval permits the
              selected agents to run with your local login for 30 days and upload their results to
              this workspace.
            </p>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium text-gray-300">
                Permitted agents in this workspace
              </legend>
              {eligible.map((agent) => (
                <label key={agent.id} className="flex items-center gap-3 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={selected.includes(agent.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked
                          ? [...prev, agent.id]
                          : prev.filter((id) => id !== agent.id),
                      )
                    }
                  />
                  {agent.name}
                </label>
              ))}
              {!eligible.length && (
                <p className="text-sm text-gray-400">
                  Create an agent with {pairing.runtime} execution first, then review this code
                  again.
                </p>
              )}
            </fieldset>
            <label className="flex items-start gap-3 text-sm text-gray-300">
              <input
                className="mt-1"
                type="checkbox"
                checked={initiated}
                onChange={(e) => setInitiated(e.target.checked)}
              />
              I started this pairing on my laptop and approve these agents using my login.
            </label>
            <button
              type="button"
              disabled={busy || !initiated || !selected.length}
              className="bg-brand-primary focus-visible:outline-brand-primary rounded-lg px-4 py-2.5 text-sm font-medium text-black hover:brightness-110 focus-visible:outline disabled:opacity-50"
              onClick={() => void approve()}
            >
              Approve device
            </button>
          </div>
        )}
      </section>
      {error && (
        <p role="alert" className="text-status-error-text text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-gray-200">
          {notice}
        </p>
      )}
      <section aria-labelledby="your-devices-title" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="your-devices-title" className="text-lg font-medium text-gray-200">
            Your devices
          </h2>
          <button
            type="button"
            className="focus-visible:outline-brand-primary rounded-lg p-2 text-gray-400 hover:text-gray-100 focus-visible:outline"
            aria-label="Refresh devices"
            onClick={() => void devices.refetch()}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {devices.isLoading ? (
          <p className="text-sm text-gray-400">Loading your devices…</p>
        ) : devices.error ? (
          <p role="alert" className="text-status-error-text text-sm">
            Devices could not be loaded. Refresh to try again.
          </p>
        ) : !devices.data?.length ? (
          <div className="flex items-start gap-3 py-4 text-sm text-gray-400">
            <Monitor className="mt-0.5 shrink-0" size={20} />
            <p>No device connected. Start the command above to pair your laptop.</p>
          </div>
        ) : (
          <ul className="divide-border divide-y">
            {devices.data.map((device) => {
              const state = device.revoked_at
                ? 'Revoked'
                : Date.parse(device.approved_until) <= Date.now()
                  ? 'Expired'
                  : device.last_seen_at && Date.now() - Date.parse(device.last_seen_at) < 10_000
                    ? device.active_task_id
                      ? 'Busy'
                      : 'Online'
                    : 'Offline'
              return (
                <li
                  key={device.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words text-gray-200">{device.name}</p>
                    <p className="text-sm text-gray-400">
                      {device.runtime} · {state} · {device.agent_ids.length} approved agents
                    </p>
                    <p className="text-xs text-gray-400">
                      Grant expires {new Date(device.approved_until).toLocaleDateString()}
                    </p>
                  </div>
                  {!device.revoked_at && (
                    <button
                      type="button"
                      disabled={busy}
                      className="border-border hover:text-status-error-text focus-visible:outline-brand-primary rounded-lg border px-3 py-2 text-sm text-gray-300 focus-visible:outline disabled:opacity-50"
                      onClick={() => void revoke(device.id)}
                    >
                      Revoke
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <p className="text-sm leading-relaxed text-gray-400">
        Jobs use a fresh private directory containing only their supplied files. Native tools remain
        trusted software; ACP is not an operating-system sandbox. Offline jobs wait up to 15
        minutes. Expired execution leases fail for review, and CrewForm never falls back to a paid
        API.
      </p>
    </div>
  )
}
