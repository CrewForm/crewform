// SPDX-License-Identifier: AGPL-3.0-or-later
import { useId } from 'react'
import type { AgentFormData } from '@/lib/agentSchema'

type Patch = Pick<AgentFormData, 'config' | 'model' | 'tools' | 'fallback_model'>
const inputClass = 'w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary'

/** Native authentication is configured on the runner, never in the browser. */
export function ExecutionSettings({ data, onChange }: { data: AgentFormData; onChange: (patch: Patch) => void }) {
    const id = useId()
    const execution = data.config?.execution as { kind?: string; agent?: string; transport?: string } | undefined
    const external = execution?.kind === 'external'
    function select(value: string) {
        const [agent, transport] = value.split(':')
        onChange({
            config: { ...data.config, execution: value === 'api' ? { kind: 'api' } : { kind: 'external', agent, transport } },
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
                    ? 'Uses the native tool’s login on a trusted self-hosted runner. Sign in there first. Your plan’s limits apply; billing depends on that login. No automatic API fallback. CrewForm Cloud cannot access your local login.'
                    : 'Uses your workspace API keys or a configured Ollama server.'}
            </p>
            {external && <p className="text-sm leading-relaxed text-gray-400">The native agent chooses its default model and manages its own tools. Codex runs with a read-only sandbox; Claude CLI tools are disabled. ACP requests for permission are refused. ACP requires a trusted, isolated working directory.</p>}
        </div>
    )
}
