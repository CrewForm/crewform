// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect, useMemo } from 'react'
import { Loader2, Save, Trash2, Eye, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
    fetchOutputTemplates,
    createOutputTemplate,
    renderTemplate,
} from '@/db/outputTemplates'
import type { OutputTemplate, OutputTemplateType } from '@/types'

const TEMPLATE_TYPES: { value: OutputTemplateType; label: string }[] = [
    { value: 'markdown', label: 'Markdown' },
    { value: 'json', label: 'JSON' },
    { value: 'html', label: 'HTML' },
    { value: 'csv', label: 'CSV' },
    { value: 'custom', label: 'Custom' },
]

const AVAILABLE_VARIABLES = [
    { name: 'task_title', description: 'Title of the task' },
    { name: 'task_result', description: 'Full output from the agent' },
    { name: 'agent_name', description: 'Name of the agent that ran the task' },
    { name: 'timestamp', description: 'ISO 8601 timestamp of completion' },
    { name: 'tokens_used', description: 'Total tokens used during execution' },
    { name: 'model', description: 'Model ID used for execution' },
]

const SAMPLE_VARIABLES: Record<string, string> = {
    task_title: 'Competitor Analysis Q1 2026',
    task_result: '## Key Findings\n\n1. Market share shifted 12% toward AI-first platforms\n2. Three new entrants identified in the mid-market segment\n3. Pricing consolidation trend continuing',
    agent_name: 'Ava (Researcher)',
    timestamp: new Date().toISOString(),
    tokens_used: '4,218',
    model: 'gemini-2.0-flash',
}

interface OutputTemplateTabProps {
    agentId: string
    workspaceId: string
    /** Currently assigned output template ID */
    currentTemplateId: string | null
    /** Callback when settings change (dirty tracking) */
    onChanged: () => void
    /** Callback after a successful save to reset parent dirty state */
    onSaved: () => void
}

export function OutputTemplateTab({ agentId, workspaceId, currentTemplateId, onChanged, onSaved }: OutputTemplateTabProps) {
    const [templates, setTemplates] = useState<OutputTemplate[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(currentTemplateId)
    const [templateType, setTemplateType] = useState<OutputTemplateType>('markdown')
    const [templateBody, setTemplateBody] = useState('')
    const [showPreview, setShowPreview] = useState(false)
    const [showVariables, setShowVariables] = useState(false)
    const [showCreateNew, setShowCreateNew] = useState(false)
    const [newTemplateName, setNewTemplateName] = useState('')

    // Load templates
    useEffect(() => {
        async function load() {
            try {
                const data = await fetchOutputTemplates(workspaceId)
                setTemplates(data)

                // If agent has an assigned template, load its content
                if (currentTemplateId) {
                    const current = data.find(t => t.id === currentTemplateId)
                    if (current) {
                        setTemplateType(current.template_type)
                        setTemplateBody(current.body)
                    }
                }
            } catch (err) {
                console.error('[OutputTemplateTab] Load failed:', err)
            } finally {
                setIsLoading(false)
            }
        }
        void load()
    }, [workspaceId, currentTemplateId])

    // Apply a template
    function applyTemplate(templateId: string) {
        const template = templates.find(t => t.id === templateId)
        if (!template) return
        setTemplateType(template.template_type)
        setTemplateBody(template.body)
        setSelectedTemplateId(templateId)
        onChanged()
    }

    // Preview rendered output
    const previewResult = useMemo(() => {
        if (!templateBody) return null
        return renderTemplate(templateBody, SAMPLE_VARIABLES)
    }, [templateBody])

    // Save template assignment to agent
    async function handleSave() {
        setIsSaving(true)
        try {
            const { supabase } = await import('@/lib/supabase')
            const { error } = await supabase
                .from('agents')
                .update({ output_template_id: selectedTemplateId })
                .eq('id', agentId)

            if (error) throw error
            toast.success('Output template saved')
            onSaved()
        } catch (err) {
            console.error('[OutputTemplateTab] Save failed:', err)
            toast.error('Failed to save template')
        } finally {
            setIsSaving(false)
        }
    }

    // Remove template from agent
    async function handleRemove() {
        setIsSaving(true)
        try {
            const { supabase } = await import('@/lib/supabase')
            const { error } = await supabase
                .from('agents')
                .update({ output_template_id: null })
                .eq('id', agentId)

            if (error) throw error
            setSelectedTemplateId(null)
            setTemplateBody('')
            setTemplateType('markdown')
            toast.success('Output template removed')
            onSaved()
        } catch (err) {
            console.error('[OutputTemplateTab] Remove failed:', err)
            toast.error('Failed to remove template')
        } finally {
            setIsSaving(false)
        }
    }

    // Create new custom template
    async function handleCreateTemplate() {
        if (!newTemplateName.trim() || !templateBody.trim()) return
        setIsSaving(true)
        try {
            const created = await createOutputTemplate({
                workspace_id: workspaceId,
                name: newTemplateName.trim(),
                template_type: templateType,
                body: templateBody,
            })
            setTemplates(prev => [...prev, created])
            setSelectedTemplateId(created.id)
            setShowCreateNew(false)
            setNewTemplateName('')
            onSaved()
            toast.success(`Template "${created.name}" created`)

            // Assign to agent
            const { supabase } = await import('@/lib/supabase')
            await supabase
                .from('agents')
                .update({ output_template_id: created.id })
                .eq('id', agentId)
        } catch (err) {
            console.error('[OutputTemplateTab] Create failed:', err)
            toast.error('Failed to create template')
        } finally {
            setIsSaving(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            {/* Template Selector */}
            <div>
                <label htmlFor="output-template-select" className="mb-1.5 block text-sm font-medium text-gray-300">
                    Choose a Template
                </label>
                <select
                    id="output-template-select"
                    value={selectedTemplateId ?? ''}
                    onChange={(e) => {
                        const val = e.target.value
                        if (val) {
                            applyTemplate(val)
                        } else {
                            setSelectedTemplateId(null)
                            setTemplateBody('')
                            setTemplateType('markdown')
                            onChanged()
                        }
                    }}
                    className="w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-brand-primary"
                >
                    <option value="">None — no output template</option>
                    {templates.filter(t => t.is_builtin).length > 0 && (
                        <optgroup label="Built-in Templates">
                            {templates.filter(t => t.is_builtin).map(t => (
                                <option key={t.id} value={t.id}>
                                    {t.name} ({t.template_type})
                                </option>
                            ))}
                        </optgroup>
                    )}
                    {templates.filter(t => !t.is_builtin).length > 0 && (
                        <optgroup label="Workspace Templates">
                            {templates.filter(t => !t.is_builtin).map(t => (
                                <option key={t.id} value={t.id}>
                                    {t.name} ({t.template_type})
                                </option>
                            ))}
                        </optgroup>
                    )}
                </select>
            </div>

            {/* Template Type */}
            <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                    Template Type
                </label>
                <div className="flex rounded-lg border border-border overflow-hidden">
                    {TEMPLATE_TYPES.map((type) => (
                        <button
                            key={type.value}
                            type="button"
                            onClick={() => { setTemplateType(type.value); onChanged() }}
                            className={cn(
                                'flex-1 px-3 py-2 text-sm font-medium transition-colors border-r border-border last:border-r-0',
                                templateType === type.value
                                    ? 'bg-brand-muted/20 text-brand-primary'
                                    : 'text-gray-400 hover:bg-surface-elevated hover:text-gray-300',
                            )}
                        >
                            {type.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Template Body Editor */}
            <div>
                <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="template-body" className="text-sm font-medium text-gray-300">
                        Template Body
                    </label>
                    <button
                        type="button"
                        onClick={() => setShowPreview(!showPreview)}
                        className="flex items-center gap-1.5 text-xs text-brand-primary hover:text-brand-primary/80"
                    >
                        <Eye className="h-3 w-3" />
                        {showPreview ? 'Hide Preview' : 'Preview'}
                    </button>
                </div>
                <textarea
                    id="template-body"
                    value={templateBody}
                    onChange={(e) => { setTemplateBody(e.target.value); onChanged() }}
                    placeholder={`# {{task_title}}\n\n> Generated by **{{agent_name}}** on {{timestamp}}\n\n{{task_result}}\n\n---\n*Tokens: {{tokens_used}} · Model: {{model}}*`}
                    rows={10}
                    maxLength={10000}
                    className="w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 font-mono text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                />
                <div className="mt-1 flex justify-between">
                    <p className="text-xs text-gray-500">
                        Use <code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-[11px] text-brand-primary">{'{{variable}}'}</code> syntax for dynamic values.
                    </p>
                    <span className="text-xs text-gray-600">
                        {templateBody.length.toLocaleString()} / 10,000
                    </span>
                </div>
            </div>

            {/* Variable Reference */}
            <div>
                <button
                    type="button"
                    onClick={() => setShowVariables(!showVariables)}
                    className="flex items-center gap-1.5 text-sm font-medium text-gray-300 hover:text-gray-200"
                >
                    {showVariables ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Available Variables
                </button>
                {showVariables && (
                    <div className="mt-2 rounded-lg border border-border bg-surface-card divide-y divide-border">
                        {AVAILABLE_VARIABLES.map(v => (
                            <div key={v.name} className="flex items-center justify-between px-4 py-2.5">
                                <code className="rounded bg-surface-elevated px-2 py-0.5 font-mono text-xs text-brand-primary">
                                    {`{{${v.name}}}`}
                                </code>
                                <span className="text-xs text-gray-500">{v.description}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Preview Panel */}
            {showPreview && templateBody && previewResult && (
                <div className="rounded-lg border border-brand-primary/30 bg-brand-muted/5 p-4">
                    <h4 className="mb-2 text-sm font-medium text-gray-300">Preview (sample data)</h4>
                    {previewResult.missingVariables.length > 0 && (
                        <p className="mb-2 text-xs text-yellow-400">
                            ⚠ Missing variables: {previewResult.missingVariables.join(', ')}
                        </p>
                    )}
                    <pre className="whitespace-pre-wrap rounded-lg bg-surface-card border border-border p-4 text-xs text-gray-300 font-mono leading-relaxed">
                        {previewResult.rendered}
                    </pre>
                </div>
            )}

            {/* Create New Template */}
            {showCreateNew ? (
                <div className="rounded-lg border border-brand-primary/30 bg-brand-muted/10 p-4">
                    <label htmlFor="new-template-name" className="mb-1.5 block text-sm font-medium text-gray-300">
                        Template Name
                    </label>
                    <div className="flex gap-2">
                        <input
                            id="new-template-name"
                            type="text"
                            value={newTemplateName}
                            onChange={(e) => setNewTemplateName(e.target.value)}
                            placeholder="e.g. GitHub PR Description"
                            className="flex-1 rounded-lg border border-border bg-surface-card px-4 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary"
                        />
                        <button
                            type="button"
                            onClick={() => void handleCreateTemplate()}
                            disabled={!newTemplateName.trim() || !templateBody.trim() || isSaving}
                            className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Create
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowCreateNew(false); setNewTemplateName('') }}
                            className="rounded-lg border border-border px-3 py-2 text-sm text-gray-400 hover:bg-surface-elevated"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setShowCreateNew(true)}
                    className="text-xs text-brand-primary hover:text-brand-primary/80"
                >
                    + Save current body as a new workspace template
                </button>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-border pt-4">
                <button
                    type="button"
                    onClick={() => void handleRemove()}
                    disabled={isSaving || !currentTemplateId}
                    className="flex items-center gap-2 rounded-lg border border-red-600/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-600/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Trash2 className="h-4 w-4" />
                    Remove Template
                </button>
                <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={isSaving}
                    className="flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Template
                </button>
            </div>
        </div>
    )
}
