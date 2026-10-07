// SPDX-License-Identifier: AGPL-3.0-or-later
import { useId } from 'react'
import type { AgentFormData } from '@/lib/agentSchema'
import { useWorkspace } from '@/hooks/useWorkspace'
import { usePersonalDevices } from '@/hooks/usePersonalDevices'

type Patch = Pick<AgentFormData, 'config' | 'model' | 'tools' | 'fallback_model'>
const inputClass = 'w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary'

/** Native authentication is configured on the runner, never in the browser. */
export function ExecutionSettings({ data, onChange }: { data: AgentFormData; onChange: (patch: Patch) => void }) {
    const id = useId()
    const {workspaceId}=useWorkspace()
    const devices=usePersonalDevices(workspaceId)
    const execution = data.config?.execution as { kind?: string; agent?: string; transport?: string } | undefined
    const external = execution?.kind === 'external'
    const runtime=`${execution?.agent}:${execution?.transport}`
    const grantedDevices=(devices.data??[]).filter(device=>!device.revoked_at&&Date.parse(device.approved_until)>Date.now()&&device.runtime===runtime)
    const currentDevice=typeof data.config?.paired_device_id==='string'?data.config.paired_device_id:''
    function select(value: string) {
        const [agent, transport] = value.split(':')
        onChange({
            config: { ...data.config, paired_device_id:undefined, execution: value === 'api' ? { kind: 'api' } : { kind: 'external', agent, transport } },
            model: value === 'api' ? '' : 'default', tools: [], fallback_model: null,
        })
    }
    return (
        <div className="space-y-2">
            <label htmlFor={id} className="block text-sm font-medium text-gray-300">Execution</label>
            <select id={id} className={inputClass} value={external ? `${execution.agent}:${execution.transport}` : 'api'} onChange={e => select(e.target.value)} aria-describedby={`${id}-help`}>
                <option value="api">Model API or Ollama</option>
                <option value="codex:cli">Codex · local CLI</option>
                <option value="claude:cli">Claude Code · local CLI</option>
                <option value="gemini:acp">Gemini CLI · ACP</option>
                <option value="copilot:acp">GitHub Copilot · ACP</option>
                <option value="codex:acp">Codex · ACP adapter</option>
                <option value="claude:acp">Claude Code · ACP adapter</option>
            </select>
            <p id={`${id}-help`} className="text-sm leading-relaxed text-gray-400">
                {external
                    ? 'Uses the native tool’s login on your paired device or a trusted self-hosted runner. Your provider plan’s limits apply. No automatic API fallback.'
                    : 'Uses your workspace API keys or a configured Ollama server.'}
            </p>
            {external && <p className="text-sm leading-relaxed text-gray-400">The native agent chooses its default model and manages its own tools. Codex runs with a read-only sandbox; Claude CLI tools are disabled. ACP requests for permission are refused. ACP requires a trusted, isolated working directory.</p>}
            {external&&<div className="space-y-2"><label htmlFor={`${id}-device`} className="block text-sm font-medium text-gray-300">Run on</label><select id={`${id}-device`} className={inputClass} value={currentDevice} onChange={e=>onChange({config:{...data.config,paired_device_id:e.target.value||undefined},model:data.model,tools:data.tools,fallback_model:data.fallback_model})}><option value="">Trusted self-hosted runner</option>{currentDevice&&!grantedDevices.some(d=>d.id===currentDevice)&&<option value={currentDevice}>Device unavailable · choose a new target</option>}{grantedDevices.map(device=><option key={device.id} value={device.id}>{device.name} · your personal device</option>)}</select><p className="text-sm text-gray-400">Pair a device and approve this agent in <a className="text-brand-primary underline underline-offset-4" href="/settings/personal-devices">Personal devices</a> first. A paired agent accepts only its device owner’s single-agent tasks. Teams and public widgets cannot use that login.</p></div>}
        </div>
    )
}
