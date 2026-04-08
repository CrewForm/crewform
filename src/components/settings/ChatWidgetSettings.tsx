// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect, useCallback } from 'react'
import { Plus, Copy, Trash2, ToggleLeft, ToggleRight, ExternalLink, Code2, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatWidgetConfig {
  id: string
  workspace_id: string
  agent_id: string
  name: string
  api_key: string
  allowed_domains: string[]
  theme: {
    mode: 'light' | 'dark'
    primaryColor: string
    bubblePosition: 'bottom-right' | 'bottom-left'
    brandName: string
    showBranding: boolean
  }
  welcome_message: string
  placeholder_text: string
  rate_limit_per_hour: number
  is_active: boolean
  created_at: string
}

interface Agent {
  id: string
  name: string
  description: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateChatApiKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let key = 'cf_chat_'
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return key
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ChatWidgetSettings() {
  const { workspaceId } = useWorkspace()
  const [widgets, setWidgets] = useState<ChatWidgetConfig[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showEmbed, setShowEmbed] = useState<string | null>(null) // widget ID
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Create form state
  const [formName, setFormName] = useState('Support Widget')
  const [formAgentId, setFormAgentId] = useState('')
  const [formWelcome, setFormWelcome] = useState('Hi! How can I help you today?')
  const [formPlaceholder, setFormPlaceholder] = useState('Type a message...')
  const [formDomains, setFormDomains] = useState('')
  const [formThemeMode, setFormThemeMode] = useState<'light' | 'dark'>('light')
  const [formPosition, setFormPosition] = useState<'bottom-right' | 'bottom-left'>('bottom-right')
  const [formPrimaryColor, setFormPrimaryColor] = useState('#6bedb9')
  const [formRateLimit, setFormRateLimit] = useState(20)
  const [creating, setCreating] = useState(false)

  // ─── Data Loading ─────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)

    const [widgetRes, agentRes] = await Promise.all([
      supabase
        .from('chat_widget_configs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false }),
      supabase
        .from('agents')
        .select('id, name, description')
        .eq('workspace_id', workspaceId)
        .order('name'),
    ])

    setWidgets((widgetRes.data ?? []) as ChatWidgetConfig[])
    setAgents((agentRes.data ?? []) as Agent[])
    setLoading(false)
  }, [workspaceId])

  useEffect(() => { void loadData() }, [loadData])

  // ─── Create Widget ────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!workspaceId || !formAgentId) return
    setCreating(true)

    const domains = formDomains
      .split(',')
      .map(d => d.trim())
      .filter(Boolean)

    const { error } = await supabase.from('chat_widget_configs').insert({
      workspace_id: workspaceId,
      agent_id: formAgentId,
      name: formName,
      api_key: generateChatApiKey(),
      allowed_domains: domains,
      theme: {
        mode: formThemeMode,
        primaryColor: formPrimaryColor,
        bubblePosition: formPosition,
        brandName: 'CrewForm',
        showBranding: true,
      },
      welcome_message: formWelcome,
      placeholder_text: formPlaceholder,
      rate_limit_per_hour: formRateLimit,
      is_active: true,
    })

    if (error) {
      console.error('Failed to create widget:', error)
    } else {
      setShowCreate(false)
      setFormName('Support Widget')
      setFormAgentId('')
      setFormWelcome('Hi! How can I help you today?')
      setFormPlaceholder('Type a message...')
      setFormDomains('')
      setFormThemeMode('light')
      setFormPosition('bottom-right')
      setFormPrimaryColor('#6bedb9')
      setFormRateLimit(20)
      void loadData()
    }

    setCreating(false)
  }

  // ─── Toggle Active ────────────────────────────────────────────────────

  const toggleActive = async (id: string, currentlyActive: boolean) => {
    await supabase
      .from('chat_widget_configs')
      .update({ is_active: !currentlyActive })
      .eq('id', id)
    void loadData()
  }

  // ─── Delete Widget ────────────────────────────────────────────────────

  const deleteWidget = async (id: string) => {
    if (!confirm('Delete this chat widget? This will also remove all chat sessions.')) return
    await supabase.from('chat_widget_configs').delete().eq('id', id)
    void loadData()
  }

  // ─── Regenerate Key ───────────────────────────────────────────────────

  const regenerateKey = async (id: string) => {
    if (!confirm('Regenerate the API key? Existing deployments will stop working until updated.')) return
    const newKey = generateChatApiKey()
    await supabase.from('chat_widget_configs').update({ api_key: newKey }).eq('id', id)
    void loadData()
  }

  // ─── Copy to Clipboard ───────────────────────────────────────────────

  const copyToClipboard = (text: string, keyId: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedKey(keyId)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // ─── Embed Snippet ────────────────────────────────────────────────────

  const getEmbedSnippet = (widget: ChatWidgetConfig) => {
    const runnerUrl = import.meta.env.VITE_TASK_RUNNER_URL ?? 'https://runner.crewform.tech'
    return `<script\n  src="${runnerUrl}/chat/widget.js"\n  data-key="${widget.api_key}"\n  data-theme="${widget.theme.mode}"\n  data-position="${widget.theme.bubblePosition}"\n  async\n></script>`
  }

  // ─── Render ───────────────────────────────────────────────────────────

  const agentNameMap = new Map(agents.map(a => [a.id, a.name]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Chat Widget</h2>
          <p className="mt-1 text-sm text-gray-400">
            Embed a chat widget on any website to let visitors talk to your agents.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-gray-900 transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          New Widget
        </button>
      </div>

      {/* ─── Widget List ──────────────────────────────────────────────── */}

      {loading ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : widgets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 py-12 text-center">
          <Code2 className="mx-auto mb-3 h-8 w-8 text-gray-500" />
          <p className="text-sm text-gray-400">No chat widgets yet.</p>
          <p className="mt-1 text-xs text-gray-500">Create one to embed on your website.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {widgets.map(w => (
            <div
              key={w.id}
              className="rounded-lg border border-border bg-card p-4 transition hover:border-brand-primary/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ background: w.is_active ? '#6bedb9' : '#6b7280' }}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-200">{w.name}</p>
                    <p className="text-xs text-gray-500">
                      Agent: {agentNameMap.get(w.agent_id) ?? 'Unknown'} · 
                      {w.allowed_domains.length > 0
                        ? ` Domains: ${w.allowed_domains.join(', ')}`
                        : ' All domains'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEmbed(showEmbed === w.id ? null : w.id)}
                    className="rounded px-2.5 py-1.5 text-xs font-medium text-brand-primary transition hover:bg-brand-primary/10"
                  >
                    <ExternalLink className="mr-1 inline h-3 w-3" />
                    Embed Code
                  </button>
                  <button
                    type="button"
                    onClick={() => void regenerateKey(w.id)}
                    className="rounded p-1.5 text-gray-500 transition hover:bg-white/5 hover:text-gray-300"
                    title="Regenerate API key"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(w.id, w.is_active)}
                    className="rounded p-1.5 text-gray-500 transition hover:bg-white/5 hover:text-gray-300"
                    title={w.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {w.is_active
                      ? <ToggleRight className="h-4 w-4 text-brand-primary" />
                      : <ToggleLeft className="h-4 w-4" />
                    }
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteWidget(w.id)}
                    className="rounded p-1.5 text-gray-500 transition hover:bg-red-500/10 hover:text-red-400"
                    title="Delete widget"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Embed Code Panel */}
              {showEmbed === w.id && (
                <div className="mt-4 rounded-md border border-border bg-background/50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                      Embed Snippet
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(getEmbedSnippet(w), `embed-${w.id}`)}
                      className="flex items-center gap-1 text-xs text-brand-primary transition hover:brightness-110"
                    >
                      <Copy className="h-3 w-3" />
                      {copiedKey === `embed-${w.id}` ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded bg-gray-900/50 p-3 text-xs text-gray-300">
                    <code>{getEmbedSnippet(w)}</code>
                  </pre>
                  <p className="mt-2 text-xs text-gray-500">
                    Add this snippet to your website's HTML, just before the closing <code>&lt;/body&gt;</code> tag.
                  </p>

                  <div className="mt-3 border-t border-border pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                        API Key
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(w.api_key, `key-${w.id}`)}
                        className="flex items-center gap-1 text-xs text-brand-primary transition hover:brightness-110"
                      >
                        <Copy className="h-3 w-3" />
                        {copiedKey === `key-${w.id}` ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <code className="mt-1 block text-xs text-gray-400">
                      {w.api_key.slice(0, 12)}{'•'.repeat(20)}{w.api_key.slice(-4)}
                    </code>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Create Widget Modal ──────────────────────────────────────── */}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-100">Create Chat Widget</h3>

            <div className="space-y-4">
              {/* Agent */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Agent</label>
                <select
                  value={formAgentId}
                  onChange={e => setFormAgentId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-gray-200"
                >
                  <option value="">Select an agent...</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Widget Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Widget Name</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-gray-200"
                  placeholder="e.g., Support Widget"
                />
              </div>

              {/* Welcome Message */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Welcome Message</label>
                <textarea
                  value={formWelcome}
                  onChange={e => setFormWelcome(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-gray-200"
                />
              </div>

              {/* Placeholder */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Input Placeholder</label>
                <input
                  value={formPlaceholder}
                  onChange={e => setFormPlaceholder(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-gray-200"
                />
              </div>

              {/* Allowed Domains */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Allowed Domains <span className="text-gray-500">(comma-separated, empty = all)</span>
                </label>
                <input
                  value={formDomains}
                  onChange={e => setFormDomains(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-gray-200"
                  placeholder="example.com, app.example.com"
                />
              </div>

              {/* Theme & Position */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Theme</label>
                  <select
                    value={formThemeMode}
                    onChange={e => setFormThemeMode(e.target.value as 'light' | 'dark')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-gray-200"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Position</label>
                  <select
                    value={formPosition}
                    onChange={e => setFormPosition(e.target.value as 'bottom-right' | 'bottom-left')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-gray-200"
                  >
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formPrimaryColor}
                      onChange={e => setFormPrimaryColor(e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
                    />
                    <span className="text-xs text-gray-500">{formPrimaryColor}</span>
                  </div>
                </div>
              </div>

              {/* Rate Limit */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Rate Limit <span className="text-gray-500">(messages per hour per visitor)</span>
                </label>
                <input
                  type="number"
                  value={formRateLimit}
                  onChange={e => setFormRateLimit(parseInt(e.target.value) || 20)}
                  min={1}
                  max={1000}
                  className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-gray-200"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg px-4 py-2 text-sm text-gray-400 transition hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!formAgentId || !formName || creating}
                className={cn(
                  'rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-gray-900 transition hover:brightness-110',
                  (!formAgentId || creating) && 'cursor-not-allowed opacity-50',
                )}
              >
                {creating ? 'Creating...' : 'Create Widget'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
