// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Plus, Trash2, Pencil, ToggleLeft, ToggleRight, Plug, ExternalLink, Server, RefreshCw, CheckCircle2, AlertCircle, Cpu } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useMcpServers, useCreateMcpServer, useUpdateMcpServer, useDeleteMcpServer } from '@/hooks/useMcpServers'
import { discoverMcpTools } from '@/db/mcpServers'
import type { McpServer } from '@/db/mcpServers'
import { useWorkspace } from '@/hooks/useWorkspace'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface McpServerFormData {
    name: string
    description: string
    url: string
    transport: 'streamable-http' | 'sse' | 'stdio'
    headers: string // JSON string for HTTP headers
}

const EMPTY_FORM: McpServerFormData = {
    name: '',
    description: '',
    url: '',
    transport: 'streamable-http',
    headers: '',
}

export function McpServersSettings() {
    const { workspaceId } = useWorkspace()
    const { mcpServers, isLoading } = useMcpServers(workspaceId)
    const createMutation = useCreateMcpServer()
    const updateMutation = useUpdateMcpServer()
    const deleteMutation = useDeleteMcpServer()

    const [showForm, setShowForm] = useState(false)
    const [editId, setEditId] = useState<string | null>(null)
    const [form, setForm] = useState<McpServerFormData>(EMPTY_FORM)
    const [discoveringId, setDiscoveringId] = useState<string | null>(null)
    const [discoveryStatus, setDiscoveryStatus] = useState<{ id: string; ok: boolean; message: string } | null>(null)

    async function handleDiscover(server: McpServer) {
        setDiscoveringId(server.id)
        setDiscoveryStatus(null)
        try {
            const tools = await discoverMcpTools(server)
            setDiscoveryStatus({ id: server.id, ok: true, message: `Found ${String(tools.length)} tools` })
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            setDiscoveryStatus({ id: server.id, ok: false, message: msg })
        } finally {
            setDiscoveringId(null)
        }
    }

    function openCreate() {
        setForm(EMPTY_FORM)
        setEditId(null)
        setShowForm(true)
    }

    function openEdit(server: { id: string; name: string; description: string; url: string; transport: string; config: Record<string, unknown> }) {
        setForm({
            name: server.name,
            description: server.description || '',
            url: server.url,
            transport: server.transport as McpServerFormData['transport'],
            headers: server.config.headers ? JSON.stringify(server.config.headers, null, 2) : '',
        })
        setEditId(server.id)
        setShowForm(true)
    }

    function handleSave() {
        if (!workspaceId || !form.name.trim() || !form.url.trim()) return

        let headers: Record<string, string> | undefined
        if (form.headers.trim()) {
            try {
                headers = JSON.parse(form.headers) as Record<string, string>
            } catch {
                return // invalid JSON
            }
        }

        const config = headers ? { headers } : {}

        if (editId) {
            updateMutation.mutate(
                { id: editId, input: { name: form.name, description: form.description, url: form.url, transport: form.transport, config } },
                { onSuccess: () => { setShowForm(false); setEditId(null) } },
            )
        } else {
            createMutation.mutate(
                { workspace_id: workspaceId, name: form.name, description: form.description, url: form.url, transport: form.transport, config },
                {
                    onSuccess: (newServer) => {
                        setShowForm(false)
                        // Auto-discover tools after creating
                        void handleDiscover(newServer)
                    },
                },
            )
        }
    }

    function toggleEnabled(id: string, currentlyEnabled: boolean) {
        updateMutation.mutate({ id, input: { is_enabled: !currentlyEnabled } })
    }

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <div style={{ width: '80%' }}>
                    <h2 className="text-lg font-semibold text-gray-100">MCP Servers</h2>
                    <p className="text-sm text-gray-500">
                        Connect to{' '}
                        <a
                            href="https://modelcontextprotocol.io/examples"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-primary hover:underline inline-flex items-center gap-0.5"
                        >
                            MCP servers <ExternalLink className="h-3 w-3" />
                        </a>
                        {' '}to give your agents access to external tools — databases, APIs, file systems, and more.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-hover"
                >
                    <Plus className="h-4 w-4" />
                    Add Server
                </button>
            </div>

            {/* Server list */}
            {isLoading ? (
                <div className="py-12 text-center text-sm text-gray-600">Loading…</div>
            ) : mcpServers.length === 0 && !showForm ? (
                <div className="mt-4 rounded-lg border border-dashed border-border py-12 text-center">
                    <Server className="mx-auto h-8 w-8 text-gray-600 mb-3" />
                    <p className="text-sm text-gray-500">No MCP servers configured yet.</p>
                    <p className="mt-1 text-xs text-gray-600">
                        Add a server to unlock thousands of tools for your agents.
                    </p>
                    <button
                        type="button"
                        onClick={openCreate}
                        className="mt-4 inline-flex items-center gap-1 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black hover:bg-brand-hover"
                    >
                        <Plus className="h-4 w-4" />
                        Add Your First Server
                    </button>
                </div>
            ) : (
                <div className="mt-4 space-y-3">
                    {mcpServers.map((server) => (
                        <div
                            key={server.id}
                            className={cn(
                                'rounded-lg border p-4 transition-colors',
                                server.is_enabled ? 'border-brand-primary/30 bg-brand-muted/5' : 'border-border opacity-60',
                            )}
                        >
                            <div className="flex items-start justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <Plug className="h-4 w-4 text-brand-primary shrink-0" />
                                        <h3 className="text-sm font-medium text-gray-200">{server.name}</h3>
                                        <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] font-mono text-gray-500">
                                            {server.transport}
                                        </span>
                                    </div>
                                    {server.description && (
                                        <p className="mt-1 text-xs text-gray-500 ml-6">{server.description}</p>
                                    )}
                                    <p className="mt-0.5 text-[10px] text-gray-600 font-mono ml-6 truncate">{server.url}</p>
                                    {server.tools_cache.length > 0 && (
                                        <div className="mt-2 ml-6 flex flex-wrap gap-1">
                                            {(server.tools_cache as Array<{ name: string }>).slice(0, 8).map((tool) => (
                                                <span key={tool.name} className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-gray-500 font-mono">
                                                    {tool.name}
                                                </span>
                                            ))}
                                            {server.tools_cache.length > 8 && (
                                                <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-gray-600">
                                                    +{server.tools_cache.length - 8} more
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 ml-2">
                                    <button
                                        type="button"
                                        onClick={() => void handleDiscover(server)}
                                        disabled={discoveringId === server.id}
                                        className={cn(
                                            'flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
                                            discoveringId === server.id
                                                ? 'text-gray-500 cursor-wait'
                                                : 'text-brand-primary hover:bg-brand-muted/20',
                                        )}
                                        title="Discover available tools"
                                    >
                                        <RefreshCw className={cn('h-3 w-3', discoveringId === server.id && 'animate-spin')} />
                                        {discoveringId === server.id ? 'Discovering…' : 'Discover Tools'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => toggleEnabled(server.id, server.is_enabled)}
                                        className="rounded p-1.5 text-gray-500 hover:text-gray-300"
                                        title={server.is_enabled ? 'Disable' : 'Enable'}
                                    >
                                        {server.is_enabled
                                            ? <ToggleRight className="h-5 w-5 text-brand-primary" />
                                            : <ToggleLeft className="h-5 w-5" />
                                        }
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openEdit(server)}
                                        className="rounded p-1.5 text-gray-500 hover:text-gray-300"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (confirm(`Delete MCP server "${server.name}"?`)) {
                                                deleteMutation.mutate(server.id)
                                            }
                                        }}
                                        className="rounded p-1.5 text-gray-500 hover:text-red-400"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                            {/* Discovery status feedback */}
                            {discoveryStatus?.id === server.id && (
                                <div className={cn(
                                    'mt-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs',
                                    discoveryStatus.ok
                                        ? 'bg-green-500/10 text-green-400'
                                        : 'bg-red-500/10 text-red-400',
                                )}>
                                    {discoveryStatus.ok
                                        ? <CheckCircle2 className="h-3 w-3 shrink-0" />
                                        : <AlertCircle className="h-3 w-3 shrink-0" />}
                                    {discoveryStatus.message}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit form */}
            {showForm && (
                <div className="mt-4 rounded-lg border border-brand-primary/30 bg-surface-card p-4">
                    <h3 className="mb-4 text-sm font-semibold text-gray-200">
                        {editId ? 'Edit MCP Server' : 'Add MCP Server'}
                    </h3>
                    <div className="space-y-3">
                        <div>
                            <label htmlFor="mcp-name" className="mb-1 block text-xs font-medium text-gray-400">Name</label>
                            <input
                                id="mcp-name"
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="GitHub, Postgres, Slack…"
                                className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-brand-primary"
                            />
                        </div>
                        <div>
                            <label htmlFor="mcp-desc" className="mb-1 block text-xs font-medium text-gray-400">Description</label>
                            <input
                                id="mcp-desc"
                                type="text"
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                placeholder="What does this server provide?"
                                className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-brand-primary"
                            />
                        </div>
                        <div>
                            <label htmlFor="mcp-url" className="mb-1 block text-xs font-medium text-gray-400">Server URL</label>
                            <input
                                id="mcp-url"
                                type="text"
                                value={form.url}
                                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                                placeholder="https://mcp-server.example.com/mcp"
                                className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm font-mono text-gray-200 placeholder-gray-600 outline-none focus:border-brand-primary"
                            />
                        </div>
                        <div>
                            <label htmlFor="mcp-transport" className="mb-1 block text-xs font-medium text-gray-400">Transport</label>
                            <select
                                id="mcp-transport"
                                value={form.transport}
                                onChange={(e) => setForm((f) => ({ ...f, transport: e.target.value as McpServerFormData['transport'] }))}
                                className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-primary"
                            >
                                <option value="streamable-http">Streamable HTTP (recommended)</option>
                                <option value="sse">SSE (legacy)</option>
                                <option value="stdio">Stdio (local/self-hosted only)</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="mcp-headers" className="mb-1 block text-xs font-medium text-gray-400">
                                HTTP Headers <span className="text-gray-600">(optional, JSON)</span>
                            </label>
                            <textarea
                                id="mcp-headers"
                                value={form.headers}
                                onChange={(e) => setForm((f) => ({ ...f, headers: e.target.value }))}
                                placeholder={'{"Authorization": "Bearer sk-..."}'}
                                rows={2}
                                className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm font-mono text-gray-200 placeholder-gray-600 outline-none focus:border-brand-primary"
                            />
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => { setShowForm(false); setEditId(null) }}
                            className="rounded-lg border border-border px-3 py-1.5 text-sm text-gray-400 hover:bg-surface-elevated"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={!form.name.trim() || !form.url.trim() || createMutation.isPending || updateMutation.isPending}
                            className="rounded-lg bg-brand-primary px-4 py-1.5 text-sm font-medium text-black hover:bg-brand-hover disabled:opacity-50"
                        >
                            {editId ? 'Update' : 'Add Server'}
                        </button>
                    </div>
                </div>
            )}

            {/* ─── MCP Server Publishing ─────────────────────────────────── */}
            <hr className="my-8 border-border" />
            <McpServerPublishing />
        </div>
    )
}

// ─── MCP Server Publishing Section ──────────────────────────────────────────

function McpServerPublishing() {
    const { workspaceId } = useWorkspace()
    const [copied, setCopied] = useState(false)

    // Fetch agents that are MCP-published
    const { data: publishedAgents, isLoading } = useQuery({
        queryKey: ['agents', workspaceId, 'mcp-published'],
        queryFn: async () => {
            if (!workspaceId) return []
            const { data } = await supabase
                .from('agents')
                .select('id, name, description')
                .eq('workspace_id', workspaceId)
                .eq('is_mcp_published', true)
                .order('name')
            return (data ?? []) as Array<{ id: string; name: string; description: string }>
        },
        enabled: !!workspaceId,
    })

    // Fetch MCP server API key
    const { data: mcpKey } = useQuery({
        queryKey: ['api-keys', workspaceId, 'mcp-server'],
        queryFn: async () => {
            if (!workspaceId) return null
            const { data } = await supabase
                .from('api_keys')
                .select('encrypted_key')
                .eq('workspace_id', workspaceId)
                .eq('provider', 'mcp-server')
                .single()
            return (data as { encrypted_key: string } | null)?.encrypted_key ?? null
        },
        enabled: !!workspaceId,
    })

    // Fall back to A2A key if no mcp-server key
    const { data: a2aKey } = useQuery({
        queryKey: ['api-keys', workspaceId, 'a2a-fallback'],
        queryFn: async () => {
            if (!workspaceId || mcpKey) return null
            const { data } = await supabase
                .from('api_keys')
                .select('encrypted_key')
                .eq('workspace_id', workspaceId)
                .eq('provider', 'a2a')
                .single()
            return (data as { encrypted_key: string } | null)?.encrypted_key ?? null
        },
        enabled: !!workspaceId && mcpKey === null,
    })

    const apiKey = mcpKey ?? a2aKey ?? 'YOUR_MCP_API_KEY'
    const taskRunnerUrl = import.meta.env.VITE_TASK_RUNNER_URL as string || 'http://localhost:3001'
    const mcpEndpoint = `${taskRunnerUrl}/mcp`

    const configSnippet = JSON.stringify({
        mcpServers: {
            crewform: {
                url: mcpEndpoint,
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            },
        },
    }, null, 2)

    function copyConfig() {
        void navigator.clipboard.writeText(configSnippet)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div>
            <div className="mb-2">
                <h2 className="text-lg font-semibold text-gray-100">MCP Server Publishing</h2>
                <p className="text-sm text-gray-500">
                    Expose your agents as MCP tools so external clients (Claude Desktop, Cursor, other agents) can call them.
                </p>
            </div>

            {/* Published agents */}
            <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Published Agents</h3>
                {isLoading ? (
                    <div className="text-sm text-gray-600">Loading…</div>
                ) : !publishedAgents || publishedAgents.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border py-6 text-center">
                        <Cpu className="mx-auto h-6 w-6 text-gray-600 mb-2" />
                        <p className="text-sm text-gray-500">No agents published as MCP tools yet.</p>
                        <p className="mt-1 text-xs text-gray-600">
                            Go to an agent's detail page and click "MCP Publish" to expose it.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {publishedAgents.map((agent) => {
                            const toolName = agent.name
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, '_')
                                .replace(/^_|_$/g, '')
                                .slice(0, 64)
                            return (
                                <div
                                    key={agent.id}
                                    className="flex items-center justify-between rounded-lg border border-brand-primary/20 bg-brand-muted/5 px-4 py-2.5"
                                >
                                    <div className="min-w-0 flex-1">
                                        <span className="text-sm font-medium text-gray-200">{agent.name}</span>
                                        <span className="ml-2 rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-mono text-gray-500">
                                            {toolName}
                                        </span>
                                    </div>
                                    <CheckCircle2 className="h-4 w-4 text-brand-primary shrink-0" />
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Connection config */}
            {publishedAgents && publishedAgents.length > 0 && (
                <div className="mt-6">
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Connection Config</h3>
                    <p className="text-xs text-gray-600 mb-2">
                        Add this to your Claude Desktop config (<code className="text-gray-500">claude_desktop_config.json</code>) or Cursor MCP settings:
                    </p>
                    <div className="relative">
                        <pre className="rounded-lg border border-border bg-surface-elevated p-4 text-xs font-mono text-gray-300 overflow-x-auto">
                            {configSnippet}
                        </pre>
                        <button
                            type="button"
                            onClick={copyConfig}
                            className="absolute top-2 right-2 rounded px-2 py-1 text-xs text-gray-500 hover:text-gray-300 hover:bg-surface-card transition-colors"
                        >
                            {copied ? '✓ Copied' : 'Copy'}
                        </button>
                    </div>
                    <div className="mt-3 rounded-lg bg-brand-muted/10 border border-brand-primary/20 px-4 py-2.5">
                        <p className="text-xs text-gray-400">
                            <span className="font-medium text-gray-300">Endpoint:</span>{' '}
                            <code className="text-brand-primary">{mcpEndpoint}</code>
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                            <span className="font-medium text-gray-300">Auth:</span>{' '}
                            Bearer token (uses your A2A or MCP-server API key)
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
