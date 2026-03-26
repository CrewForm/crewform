// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useMemo } from 'react'
import { AlertCircle, Plus, Pencil, Trash2, X, Plug } from 'lucide-react'
import type { AgentFormData } from '@/lib/agentSchema'
import { agentSchema, MODEL_OPTIONS, BUILT_IN_TOOLS, getActiveModelOptions, mergeModelOptions } from '@/lib/agentSchema'
import { useOpenRouterModels } from '@/hooks/useOpenRouterModels'
import { useCustomTools, useCreateCustomTool, useUpdateCustomTool, useDeleteCustomTool } from '@/hooks/useCustomTools'
import { CustomToolEditor } from '@/components/agents/CustomToolEditor'
import { cn } from '@/lib/utils'
import { useMcpServers } from '@/hooks/useMcpServers'
import type { CustomTool } from '@/types'
import type { ZodError } from 'zod'

interface AgentFormProps {
    initialData: AgentFormData
    onSubmit: (data: AgentFormData) => void
    onBack: () => void
    /** List of active provider IDs (lowercase). If undefined, all providers shown. */
    activeProviders?: string[]
    /** Workspace ID for loading custom tools */
    workspaceId?: string | null
}

/**
 * Step 2: Agent configuration form.
 * Name, description, model, system prompt, temperature.
 * Validates with Zod on submit.
 * Filters model selector to only show active providers when provided.
 */
export function AgentForm({ initialData, onSubmit, onBack, activeProviders, workspaceId }: AgentFormProps) {
    const [formData, setFormData] = useState<AgentFormData>(initialData)
    const [errors, setErrors] = useState<Record<string, string>>({})

    // Custom tools
    const { customTools } = useCustomTools(workspaceId ?? null)
    const createToolMutation = useCreateCustomTool()
    const updateToolMutation = useUpdateCustomTool()
    const deleteToolMutation = useDeleteCustomTool()
    const [showToolEditor, setShowToolEditor] = useState(false)
    const [editingTool, setEditingTool] = useState<CustomTool | undefined>()

    // MCP servers
    const { mcpServers } = useMcpServers(workspaceId ?? null)
    const enabledMcpServers = mcpServers.filter(s => s.is_enabled && s.tools_cache.length > 0)

    // Fetch live OpenRouter models when OpenRouter is active
    const isOpenRouterActive = activeProviders
        ? activeProviders.some((p) => p.toLowerCase() === 'openrouter')
        : true // Show all if no filter
    const { models: openRouterModels, isLoading: isLoadingModels } = useOpenRouterModels(isOpenRouterActive)

    // Determine which model groups to show, merging dynamic models
    const modelOptions = useMemo(() => {
        const filtered = activeProviders
            ? getActiveModelOptions(activeProviders)
            : MODEL_OPTIONS

        return mergeModelOptions(filtered, [
            { provider: 'OpenRouter', models: openRouterModels },
        ])
    }, [activeProviders, openRouterModels])

    const [tagInput, setTagInput] = useState('')

    function updateField<K extends keyof AgentFormData>(key: K, value: AgentFormData[K]) {
        setFormData((prev) => ({ ...prev, [key]: value }))
        // Clear field error on change
        if (errors[key]) {
            setErrors((prev) =>
                Object.fromEntries(
                    Object.entries(prev).filter(([k]) => k !== key),
                ),
            )
        }
    }

    function handleAddTag() {
        const tag = tagInput.trim().toLowerCase()
        if (tag && !formData.tags.includes(tag) && formData.tags.length < 20) {
            updateField('tags', [...formData.tags, tag])
        }
        setTagInput('')
    }

    function handleRemoveTag(tag: string) {
        updateField('tags', formData.tags.filter(t => t !== tag))
    }

    function handleSubmit() {
        try {
            const validated = agentSchema.parse(formData)
            setErrors({})
            onSubmit(validated)
        } catch (err) {
            const zodError = err as ZodError
            const fieldErrors: Record<string, string> = {}
            for (const issue of zodError.issues) {
                const field = issue.path[0]
                if (typeof field === 'string') {
                    fieldErrors[field] = issue.message
                }
            }
            setErrors(fieldErrors)
        }
    }

    return (
        <div className="space-y-6">
            {/* Name */}
            <div>
                <label htmlFor="agent-name" className="mb-1.5 block text-sm font-medium text-gray-300">
                    Name <span className="text-red-400">*</span>
                </label>
                <input
                    id="agent-name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="My Agent"
                    className="w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                />
                {errors.name && <p className="mt-1 text-xs text-status-error-text">{errors.name}</p>}
            </div>

            {/* Description */}
            <div>
                <label htmlFor="agent-desc" className="mb-1.5 block text-sm font-medium text-gray-300">
                    Description
                </label>
                <textarea
                    id="agent-desc"
                    value={formData.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="What does this agent do?"
                    rows={2}
                    className="w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                />
                {errors.description && <p className="mt-1 text-xs text-status-error-text">{errors.description}</p>}
            </div>

            {/* Model selector */}
            <div>
                <label htmlFor="agent-model" className="mb-1.5 block text-sm font-medium text-gray-300">
                    Model <span className="text-red-400">*</span>
                </label>
                {modelOptions.length > 0 ? (
                    <select
                        id="agent-model"
                        value={formData.model}
                        onChange={(e) => updateField('model', e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-brand-primary"
                    >
                        {modelOptions.map((group) => {
                            // Show loading placeholder for groups that fetch dynamically
                            if (group.models.length === 0 && isLoadingModels && group.provider === 'OpenRouter') {
                                return (
                                    <optgroup key={group.provider} label={group.provider}>
                                        <option disabled>Loading models…</option>
                                    </optgroup>
                                )
                            }
                            if (group.models.length === 0) return null
                            return (
                                <optgroup key={group.provider} label={group.provider}>
                                    {group.models.map((m) => (
                                        <option key={m.value} value={m.value}>
                                            {m.label}
                                        </option>
                                    ))}
                                </optgroup>
                            )
                        })}
                    </select>
                ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
                        <AlertCircle className="h-4 w-4 shrink-0 text-yellow-400" />
                        <p className="text-sm text-yellow-300">
                            No providers are active. Go to{' '}
                            <a href="/settings" className="font-medium underline underline-offset-2 hover:text-yellow-200">
                                Settings → API Keys
                            </a>{' '}
                            to activate a provider.
                        </p>
                    </div>
                )}
                {errors.model && <p className="mt-1 text-xs text-status-error-text">{errors.model}</p>}
            </div>

            {/* Fallback Model selector */}
            <div>
                <label htmlFor="agent-fallback-model" className="mb-1.5 block text-sm font-medium text-gray-300">
                    Fallback Model <span className="text-xs text-gray-500">(optional)</span>
                </label>
                <p className="mb-2 text-xs text-gray-500">
                    If the primary model fails (400/404), the agent will automatically retry with this model.
                </p>
                {modelOptions.length > 0 && (
                    <select
                        id="agent-fallback-model"
                        value={formData.fallback_model ?? ''}
                        onChange={(e) => updateField('fallback_model', e.target.value || null)}
                        className="w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-brand-primary"
                    >
                        <option value="">None — no fallback</option>
                        {modelOptions.map((group) => {
                            if (group.models.length === 0) return null
                            return (
                                <optgroup key={group.provider} label={group.provider}>
                                    {group.models.map((m) => (
                                        <option key={m.value} value={m.value}>
                                            {m.label}
                                        </option>
                                    ))}
                                </optgroup>
                            )
                        })}
                    </select>
                )}
            </div>

            {/* System Prompt */}
            <div>
                <label htmlFor="agent-prompt" className="mb-1.5 block text-sm font-medium text-gray-300">
                    System Prompt
                </label>
                <textarea
                    id="agent-prompt"
                    value={formData.system_prompt}
                    onChange={(e) => updateField('system_prompt', e.target.value)}
                    placeholder="You are a helpful assistant..."
                    rows={8}
                    className="w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 font-mono text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                />
                <div className="mt-1 flex justify-between">
                    {errors.system_prompt ? (
                        <p className="text-xs text-status-error-text">{errors.system_prompt}</p>
                    ) : (
                        <span />
                    )}
                    <span className="text-xs text-gray-600">
                        {formData.system_prompt.length.toLocaleString()} / 10,000
                    </span>
                </div>
            </div>

            {/* Temperature */}
            <div>
                <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="agent-temp" className="text-sm font-medium text-gray-300">
                        Temperature
                    </label>
                    <span className="text-sm font-mono text-gray-400">{formData.temperature.toFixed(1)}</span>
                </div>
                <input
                    id="agent-temp"
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={formData.temperature}
                    onChange={(e) => updateField('temperature', parseFloat(e.target.value))}
                    className="w-full accent-brand-primary"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-600">
                    <span>Precise</span>
                    <span>Creative</span>
                </div>
            </div>

            {/* Max Tokens */}
            <div>
                <label htmlFor="agent-max-tokens" className="mb-1.5 block text-sm font-medium text-gray-300">
                    Max Tokens
                </label>
                <input
                    id="agent-max-tokens"
                    type="number"
                    min={1}
                    value={formData.max_tokens ?? ''}
                    onChange={(e) => {
                        const val = e.target.value
                        updateField('max_tokens', val === '' ? null : parseInt(val, 10))
                    }}
                    placeholder="Unlimited (provider default)"
                    className="w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                />
                <p className="mt-1 text-xs text-gray-500">
                    Leave empty for unlimited (uses provider default).
                </p>
                {errors.max_tokens && <p className="mt-1 text-xs text-status-error-text">{errors.max_tokens}</p>}
            </div>

            {/* Tags */}
            <div>
                <label htmlFor="agent-tags" className="mb-1.5 block text-sm font-medium text-gray-300">
                    Tags
                </label>
                <div className="flex gap-2">
                    <input
                        id="agent-tags"
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                handleAddTag()
                            }
                        }}
                        placeholder="Add a tag and press Enter"
                        className="flex-1 rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                    />
                    <button
                        type="button"
                        onClick={handleAddTag}
                        disabled={!tagInput.trim()}
                        className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Add
                    </button>
                </div>
                {formData.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {formData.tags.map((tag) => (
                            <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-full bg-brand-muted/20 border border-brand-primary/30 px-2.5 py-0.5 text-xs font-medium text-brand-primary"
                            >
                                {tag}
                                <button
                                    type="button"
                                    onClick={() => handleRemoveTag(tag)}
                                    className="rounded-full p-0.5 hover:bg-brand-primary/20"
                                >
                                    <X className="h-2.5 w-2.5" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                {errors.tags && <p className="mt-1 text-xs text-status-error-text">{errors.tags}</p>}
            </div>

            {/* Built-in Tools */}
            <div>
                <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-300">
                        Built-in Tools
                    </label>
                    <span className="text-xs text-gray-500">
                        {formData.tools.length} enabled
                    </span>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                    Enable built-in tools to give this agent access to external capabilities during task execution.
                </p>
                <div className="space-y-2">
                    {BUILT_IN_TOOLS.map((tool) => {
                        const isEnabled = formData.tools.includes(tool.name)
                        const reqProvider = tool.requiresProvider
                        const providerMissing = reqProvider
                            ? !(activeProviders ?? []).some(p => p.toLowerCase() === reqProvider.toLowerCase())
                            : false
                        const isDisabled = providerMissing
                        return (
                            <button
                                key={tool.name}
                                type="button"
                                disabled={isDisabled}
                                onClick={() => {
                                    if (isDisabled) return
                                    const newTools = isEnabled
                                        ? formData.tools.filter(t => t !== tool.name)
                                        : [...formData.tools, tool.name]
                                    updateField('tools', newTools)
                                }}
                                className={cn(
                                    'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                                    isDisabled
                                        ? 'border-border opacity-50 cursor-not-allowed'
                                        : isEnabled
                                            ? 'border-brand-primary bg-brand-muted/20'
                                            : 'border-border hover:border-gray-600',
                                )}
                            >
                                <span className="text-lg">{tool.icon}</span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            'text-sm font-medium',
                                            isEnabled && !isDisabled ? 'text-brand-primary' : 'text-gray-300',
                                        )}>
                                            {tool.label}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500">{tool.description}</p>
                                    {isDisabled && (
                                        <p className="mt-1 text-xs text-yellow-400/70">
                                            Requires a {reqProvider === 'serper' ? 'Serper' : reqProvider} API key — configure in Settings → LLM Setup
                                        </p>
                                    )}
                                </div>
                                <div className={cn(
                                    'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
                                    isEnabled && !isDisabled ? 'bg-brand-primary' : 'bg-gray-700',
                                )}>
                                    <div className={cn(
                                        'h-4 w-4 rounded-full bg-white transition-transform',
                                        isEnabled && !isDisabled ? 'translate-x-4' : 'translate-x-0',
                                    )} />
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Custom Tools */}
            {workspaceId && (
                <div>
                    <div className="mb-1.5 flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-300">
                            Custom Tools
                        </label>
                        <button
                            type="button"
                            onClick={() => { setEditingTool(undefined); setShowToolEditor(true) }}
                            className="flex items-center gap-1 text-xs text-brand-primary hover:text-brand-primary/80"
                        >
                            <Plus className="h-3 w-3" />
                            Create Tool
                        </button>
                    </div>
                    <p className="mb-3 text-xs text-gray-500">
                        Create webhook-backed tools. When the LLM calls a custom tool, arguments are POSTed to your endpoint.
                    </p>
                    {customTools.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border py-6 text-center">
                            <p className="text-xs text-gray-600">No custom tools yet. Click &quot;Create Tool&quot; to add one.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {customTools.map((ct) => {
                                const toolKey = `custom:${ct.id}`
                                const isEnabled = formData.tools.includes(toolKey)
                                return (
                                    <div
                                        key={ct.id}
                                        className={cn(
                                            'flex w-full items-center gap-3 rounded-lg border p-3 transition-colors',
                                            isEnabled
                                                ? 'border-brand-primary bg-brand-muted/20'
                                                : 'border-border',
                                        )}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const newTools = isEnabled
                                                    ? formData.tools.filter(t => t !== toolKey)
                                                    : [...formData.tools, toolKey]
                                                updateField('tools', newTools)
                                            }}
                                            className="flex flex-1 items-center gap-3 text-left"
                                        >
                                            <span className="text-lg">🔧</span>
                                            <div className="min-w-0 flex-1">
                                                <span className={cn(
                                                    'text-sm font-medium',
                                                    isEnabled ? 'text-brand-primary' : 'text-gray-300',
                                                )}>
                                                    {ct.name}
                                                </span>
                                                <p className="text-xs text-gray-500">{ct.description}</p>
                                                <p className="mt-0.5 text-[10px] text-gray-600 truncate">{ct.webhook_url}</p>
                                            </div>
                                            <div className={cn(
                                                'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
                                                isEnabled ? 'bg-brand-primary' : 'bg-gray-700',
                                            )}>
                                                <div className={cn(
                                                    'h-4 w-4 rounded-full bg-white transition-transform',
                                                    isEnabled ? 'translate-x-4' : 'translate-x-0',
                                                )} />
                                            </div>
                                        </button>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => { setEditingTool(ct); setShowToolEditor(true) }}
                                                className="rounded p-1 text-gray-600 hover:text-gray-300"
                                            >
                                                <Pencil className="h-3 w-3" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (confirm(`Delete custom tool "${ct.name}"?`)) {
                                                        deleteToolMutation.mutate(ct.id)
                                                        const newTools = formData.tools.filter(t => t !== toolKey)
                                                        if (newTools.length !== formData.tools.length) {
                                                            updateField('tools', newTools)
                                                        }
                                                    }
                                                }}
                                                className="rounded p-1 text-gray-600 hover:text-red-400"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Custom Tool Editor Modal */}
                    {showToolEditor && (
                        <CustomToolEditor
                            tool={editingTool}
                            isSaving={createToolMutation.isPending || updateToolMutation.isPending}
                            onClose={() => { setShowToolEditor(false); setEditingTool(undefined) }}
                            onSave={(data) => {
                                if (editingTool) {
                                    updateToolMutation.mutate(
                                        { id: editingTool.id, input: data },
                                        { onSuccess: () => { setShowToolEditor(false); setEditingTool(undefined) } },
                                    )
                                } else {
                                    createToolMutation.mutate(
                                        { ...data, workspace_id: workspaceId },
                                        { onSuccess: () => { setShowToolEditor(false); setEditingTool(undefined) } },
                                    )
                                }
                            }}
                        />
                    )}
                </div>
            )}

            {/* MCP Server Tools */}
            {workspaceId && enabledMcpServers.length > 0 && (
                <div>
                    <div className="mb-1.5 flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-300">
                            MCP Server Tools
                        </label>
                        <a
                            href="/settings"
                            className="text-xs text-brand-primary hover:text-brand-primary/80"
                        >
                            Manage Servers
                        </a>
                    </div>
                    <p className="mb-3 text-xs text-gray-500">
                        Tools from connected MCP servers. Enable servers in Settings → MCP Servers.
                    </p>
                    <div className="space-y-3">
                        {enabledMcpServers.map((server) => (
                            <div key={server.id}>
                                <div className="mb-1.5 flex items-center gap-1.5">
                                    <Plug className="h-3 w-3 text-brand-primary" />
                                    <span className="text-xs font-medium text-gray-400">{server.name}</span>
                                    <span className="text-[10px] text-gray-600">({(server.tools_cache as Array<{name: string}>).length} tools)</span>
                                </div>
                                <div className="space-y-1.5 ml-4">
                                    {(server.tools_cache as Array<{name: string; description?: string}>).map((tool) => {
                                        const toolKey = `mcp:${server.id}:${tool.name}`
                                        const isEnabled = formData.tools.includes(toolKey)
                                        return (
                                            <button
                                                key={toolKey}
                                                type="button"
                                                onClick={() => {
                                                    const newTools = isEnabled
                                                        ? formData.tools.filter(t => t !== toolKey)
                                                        : [...formData.tools, toolKey]
                                                    updateField('tools', newTools)
                                                }}
                                                className={cn(
                                                    'flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors',
                                                    isEnabled
                                                        ? 'border-brand-primary bg-brand-muted/20'
                                                        : 'border-border hover:border-gray-600',
                                                )}
                                            >
                                                <span className="text-sm">🔌</span>
                                                <div className="min-w-0 flex-1">
                                                    <span className={cn(
                                                        'text-sm font-medium font-mono',
                                                        isEnabled ? 'text-brand-primary' : 'text-gray-300',
                                                    )}>
                                                        {tool.name}
                                                    </span>
                                                    {tool.description && (
                                                        <p className="text-xs text-gray-500">{tool.description}</p>
                                                    )}
                                                </div>
                                                <div className={cn(
                                                    'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
                                                    isEnabled ? 'bg-brand-primary' : 'bg-gray-700',
                                                )}>
                                                    <div className={cn(
                                                        'h-4 w-4 rounded-full bg-white transition-transform',
                                                        isEnabled ? 'translate-x-4' : 'translate-x-0',
                                                    )} />
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
                <button
                    type="button"
                    onClick={onBack}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200"
                >
                    Back
                </button>
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={activeProviders !== undefined && modelOptions.length === 0}
                    className="rounded-lg bg-brand-primary px-6 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Review
                </button>
            </div>
        </div>
    )
}
