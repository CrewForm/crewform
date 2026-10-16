// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { X, Plus, Trash2, Loader2, Globe, Code } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CustomTool, CustomToolParameter } from '@/types'

interface CustomToolEditorProps {
    /** If provided, we're editing an existing tool */
    tool?: CustomTool
    onSave: (data: {
        name: string
        description: string
        parameters: {
            properties: Record<string, { type: string; description: string }>
            required: string[]
        }
        webhook_url: string
        webhook_headers: Record<string, string>
    }) => void
    onClose: () => void
    isSaving?: boolean
}

/**
 * Modal for creating or editing a custom tool definition.
 * Provides a visual parameter builder and webhook configuration.
 */
export function CustomToolEditor({ tool, onSave, onClose, isSaving }: CustomToolEditorProps) {
    const [name, setName] = useState(tool?.name ?? '')
    const [description, setDescription] = useState(tool?.description ?? '')
    const [webhookUrl, setWebhookUrl] = useState(tool?.webhook_url ?? '')

    // Parse existing headers into key/value pairs
    const existingHeaders = tool?.webhook_headers
        ? Object.entries(tool.webhook_headers).map(([key, value]) => ({ key, value }))
        : []
    const [headers, setHeaders] = useState<{ key: string; value: string }[]>(
        existingHeaders.length > 0 ? existingHeaders : [{ key: '', value: '' }],
    )

    // Parse existing parameters
    const existingParams: CustomToolParameter[] = tool?.parameters.properties
        ? Object.entries(tool.parameters.properties).map(([paramName, param]) => ({
            name: paramName,
            type: param.type as 'string' | 'number' | 'boolean',
            description: param.description,
            required: tool.parameters.required.includes(paramName),
        }))
        : []
    const [params, setParams] = useState<CustomToolParameter[]>(
        existingParams.length > 0 ? existingParams : [],
    )

    const [errors, setErrors] = useState<Record<string, string>>({})

    function addParam() {
        setParams([...params, { name: '', type: 'string', description: '', required: false }])
    }

    function updateParam(index: number, updates: Partial<CustomToolParameter>) {
        setParams(params.map((p, i) => (i === index ? { ...p, ...updates } : p)))
    }

    function removeParam(index: number) {
        setParams(params.filter((_, i) => i !== index))
    }

    function addHeader() {
        setHeaders([...headers, { key: '', value: '' }])
    }

    function updateHeader(index: number, field: 'key' | 'value', val: string) {
        setHeaders(headers.map((h, i) => (i === index ? { ...h, [field]: val } : h)))
    }

    function removeHeader(index: number) {
        setHeaders(headers.filter((_, i) => i !== index))
    }

    function validate(): boolean {
        const newErrors: Record<string, string> = {}

        if (!name.trim()) newErrors.name = 'Name is required'
        else if (!/^[a-z_][a-z0-9_]*$/.test(name.trim())) {
            newErrors.name = 'Name must be lowercase with underscores only (e.g. my_tool)'
        }
        if (!description.trim()) newErrors.description = 'Description is required'
        if (!webhookUrl.trim()) newErrors.webhook_url = 'Webhook URL is required'
        else {
            try {
                new URL(webhookUrl.trim())
            } catch {
                newErrors.webhook_url = 'Must be a valid URL'
            }
        }

        // Validate params
        const paramNames = new Set<string>()
        for (let i = 0; i < params.length; i++) {
            const p = params[i]
            if (!p.name.trim()) {
                newErrors[`param_${i.toString()}`] = 'Parameter name is required'
            } else if (paramNames.has(p.name.trim())) {
                newErrors[`param_${i.toString()}`] = 'Duplicate parameter name'
            }
            paramNames.add(p.name.trim())
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    function handleSubmit() {
        if (!validate()) return

        // Build JSON Schema parameters
        const properties: Record<string, { type: string; description: string }> = {}
        const required: string[] = []

        for (const p of params) {
            if (!p.name.trim()) continue
            properties[p.name.trim()] = { type: p.type, description: p.description }
            if (p.required) required.push(p.name.trim())
        }

        // Build headers (filter out empty rows)
        const webhookHeaders: Record<string, string> = {}
        for (const h of headers) {
            if (h.key.trim() && h.value.trim()) {
                webhookHeaders[h.key.trim()] = h.value.trim()
            }
        }

        onSave({
            name: name.trim(),
            description: description.trim(),
            parameters: { properties, required },
            webhook_url: webhookUrl.trim(),
            webhook_headers: webhookHeaders,
        })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative mx-4 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface-card p-6 shadow-2xl">
                {/* Header */}
                <div className="mb-5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Code className="h-5 w-5 text-brand-primary" />
                        <h2 className="text-lg font-semibold text-gray-100">
                            {tool ? 'Edit Custom Tool' : 'New Custom Tool'}
                        </h2>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:text-gray-300">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Name */}
                    <div>
                        <label htmlFor="tool-name" className="mb-1 block text-sm font-medium text-gray-300">
                            Tool Name <span className="text-red-400">*</span>
                        </label>
                        <input
                            id="tool-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="my_custom_tool"
                            className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-primary"
                        />
                        {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
                        <p className="mt-1 text-xs text-gray-600">Lowercase with underscores only</p>
                    </div>

                    {/* Description */}
                    <div>
                        <label htmlFor="tool-desc" className="mb-1 block text-sm font-medium text-gray-300">
                            Description <span className="text-red-400">*</span>
                        </label>
                        <textarea
                            id="tool-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What does this tool do? The LLM reads this to decide when to use it."
                            rows={2}
                            className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-primary resize-none"
                        />
                        {errors.description && <p className="mt-1 text-xs text-red-400">{errors.description}</p>}
                    </div>

                    {/* Webhook URL */}
                    <div>
                        <label htmlFor="tool-url" className="mb-1 block text-sm font-medium text-gray-300">
                            <Globe className="inline-block h-3.5 w-3.5 mr-1" />
                            Webhook URL <span className="text-red-400">*</span>
                        </label>
                        <input
                            id="tool-url"
                            type="url"
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                            placeholder="https://api.example.com/my-tool"
                            className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-primary"
                        />
                        {errors.webhook_url && <p className="mt-1 text-xs text-red-400">{errors.webhook_url}</p>}
                        <p className="mt-1 text-xs text-gray-600">
                            Tool arguments will be POSTed as JSON to this URL
                        </p>
                    </div>

                    {/* Webhook Headers */}
                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-300">Headers (optional)</label>
                            <button
                                type="button"
                                onClick={addHeader}
                                className="text-xs text-brand-primary hover:text-brand-primary/80"
                            >
                                + Add Header
                            </button>
                        </div>
                        <div className="space-y-1.5">
                            {headers.map((h, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={h.key}
                                        onChange={(e) => updateHeader(i, 'key', e.target.value)}
                                        placeholder="Authorization"
                                        className="flex-1 rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-brand-primary"
                                    />
                                    <input
                                        type="text"
                                        value={h.value}
                                        onChange={(e) => updateHeader(i, 'value', e.target.value)}
                                        placeholder="Bearer sk-..."
                                        className="flex-1 rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-brand-primary"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeHeader(i)}
                                        className="rounded p-1 text-gray-600 hover:text-red-400"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Parameters */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-300">Parameters</label>
                            <button
                                type="button"
                                onClick={addParam}
                                className="flex items-center gap-1 text-xs text-brand-primary hover:text-brand-primary/80"
                            >
                                <Plus className="h-3 w-3" />
                                Add Parameter
                            </button>
                        </div>
                        {params.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-gray-600">
                                No parameters defined. The tool will receive no arguments.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {params.map((p, i) => (
                                    <div key={i} className="rounded-lg border border-border bg-surface-elevated p-3">
                                        <div className="flex items-start gap-2">
                                            <div className="flex-1 space-y-2">
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={p.name}
                                                        onChange={(e) => updateParam(i, { name: e.target.value })}
                                                        placeholder="param_name"
                                                        className="flex-1 rounded border border-border bg-surface-card px-2 py-1 text-xs text-gray-200 outline-none focus:border-brand-primary"
                                                    />
                                                    <select
                                                        value={p.type}
                                                        onChange={(e) => updateParam(i, { type: e.target.value as 'string' | 'number' | 'boolean' })}
                                                        className="rounded border border-border bg-surface-card px-2 py-1 text-xs text-gray-200 outline-none focus:border-brand-primary"
                                                    >
                                                        <option value="string">string</option>
                                                        <option value="number">number</option>
                                                        <option value="boolean">boolean</option>
                                                    </select>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={p.description}
                                                    onChange={(e) => updateParam(i, { description: e.target.value })}
                                                    placeholder="Description of this parameter"
                                                    className="w-full rounded border border-border bg-surface-card px-2 py-1 text-xs text-gray-200 outline-none focus:border-brand-primary"
                                                />
                                                <label className="flex items-center gap-1.5 text-xs text-gray-400">
                                                    <input
                                                        type="checkbox"
                                                        checked={p.required}
                                                        onChange={(e) => updateParam(i, { required: e.target.checked })}
                                                        className="accent-brand-primary"
                                                    />
                                                    Required
                                                </label>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeParam(i)}
                                                className="mt-1 rounded p-1 text-gray-600 hover:text-red-400"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        {errors[`param_${i.toString()}`] && (
                                            <p className="mt-1 text-xs text-red-400">{errors[`param_${i.toString()}`]}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-border px-4 py-2 text-sm text-gray-400 transition-colors hover:text-gray-200"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSaving}
                        className={cn(
                            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
                            'bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50',
                        )}
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            tool ? 'Save Changes' : 'Create Tool'
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
