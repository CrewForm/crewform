// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useState, useMemo } from 'react'
import {
    Loader2,
    Bot,
    Users2,
    Clock,
    Variable,
    ChevronRight,
    ChevronLeft,
    CheckCircle2,
    Plus,
    X,
    LayoutTemplate,
    Sparkles,
} from 'lucide-react'
import { SlidePanel } from '@/components/shared/SlidePanel'
import { useAgents } from '@/hooks/useAgents'
import { useTeams } from '@/hooks/useTeams'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useCreateTemplate } from '@/hooks/useWorkflowTemplates'
import type { PipelineConfig, TemplateVariable, TemplateAgentDef, TemplateTeamDef, TemplateTriggerDef, TemplateDefinition, Team } from '@/types'
import { cn } from '@/lib/utils'
import { cronToHuman } from '@/lib/cronToHuman'

interface CreateTemplateModalProps {
    open: boolean
    onClose: () => void
    /** Pre-select specific agents */
    preSelectedAgentIds?: string[]
    /** Pre-select a specific team */
    preSelectedTeamId?: string | null
}

type Step = 'agents' | 'variables' | 'metadata' | 'preview'

const STEP_ORDER: Step[] = ['agents', 'variables', 'metadata', 'preview']

const CATEGORY_OPTIONS = [
    { value: 'coaching', label: '🏉 Coaching' },
    { value: 'research', label: '🔬 Research' },
    { value: 'content', label: '📝 Content' },
    { value: 'devops', label: '⚙️ DevOps' },
    { value: 'reporting', label: '📊 Reporting' },
    { value: 'sales', label: '💼 Sales & Marketing' },
    { value: 'support', label: '🎧 Support' },
    { value: 'general', label: '🤖 General' },
]

const ICON_OPTIONS = ['🤖', '🏉', '📝', '📰', '🔍', '📊', '💼', '🎧', '⚙️', '🔬', '🧠', '📋', '🎯', '💡', '🚀', '🌟']

/**
 * Scan all string values in the template definition for {{variable}} patterns.
 * Returns unique variable keys found.
 */
function scanForVariables(agents: TemplateAgentDef[], team: TemplateTeamDef | null, trigger: TemplateTriggerDef | null): string[] {
    const json = JSON.stringify({ agents, team, trigger })
    const matches = json.match(/\{\{(\w+)\}\}/g)
    if (!matches) return []
    const keys = matches.map((m) => m.replace(/\{\{|\}\}/g, ''))
    return [...new Set(keys)]
}

export function CreateTemplateModal({ open, onClose, preSelectedAgentIds, preSelectedTeamId }: CreateTemplateModalProps) {
    const { workspaceId } = useWorkspace()
    const { agents: workspaceAgents } = useAgents(workspaceId ?? null)
    const { teams: workspaceTeams } = useTeams(workspaceId ?? null)
    const createMutation = useCreateTemplate()

    // ─── Step State ─────────────────────────────────────────────────────────
    const [step, setStep] = useState<Step>('agents')
    const [published, setPublished] = useState(false)

    // ─── Step 1: Agent & Team Selection ─────────────────────────────────────
    const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(preSelectedAgentIds ?? [])
    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(preSelectedTeamId ?? null)

    const selectedAgents = useMemo(
        () => workspaceAgents.filter((a) => selectedAgentIds.includes(a.id)),
        [workspaceAgents, selectedAgentIds],
    )
    const selectedTeam: Team | null = useMemo(
        () => workspaceTeams.find((t) => t.id === selectedTeamId) ?? null,
        [workspaceTeams, selectedTeamId],
    )

    // ─── Step 2: Variables ──────────────────────────────────────────────────
    const [variables, setVariables] = useState<TemplateVariable[]>([])

    // ─── Step 3: Metadata ───────────────────────────────────────────────────
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [category, setCategory] = useState('general')
    const [icon, setIcon] = useState('🤖')
    const [readme, setReadme] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [tagInput, setTagInput] = useState('')

    // Trigger (optional)
    const [enableTrigger, setEnableTrigger] = useState(false)
    const [triggerType, setTriggerType] = useState<'cron' | 'webhook'>('cron')
    const [cronExpression, setCronExpression] = useState('0 9 * * 5')
    const [taskTitleTemplate, setTaskTitleTemplate] = useState('')
    const [taskDescTemplate, setTaskDescTemplate] = useState('')

    const [isPublished, setIsPublished] = useState(true)

    // ─── Build Template Definition ──────────────────────────────────────────

    const buildAgentDefs = (): TemplateAgentDef[] =>
        selectedAgents.map((a) => ({
            name: a.name,
            description: a.description,
            system_prompt: a.system_prompt,
            model: a.model,
            provider: a.provider ?? 'openai',
            temperature: a.temperature,
            max_tokens: a.max_tokens ?? null,
            tags: Array.isArray(a.tags) ? a.tags : [],
            tools: a.tools,
        }))

    const buildTeamDef = (): TemplateTeamDef | null => {
        if (!selectedTeam) return null
        const config = selectedTeam.config as PipelineConfig
        return {
            name: selectedTeam.name,
            description: selectedTeam.description,
            mode: selectedTeam.mode,
            steps: config.steps.map((s) => ({
                agent_index: selectedAgentIds.indexOf(s.agent_id),
                step_name: s.step_name,
                instructions: s.instructions,
                expected_output: s.expected_output,
            })),
        }
    }

    const buildTriggerDef = (): TemplateTriggerDef | null => {
        if (!enableTrigger) return null
        return {
            type: triggerType,
            cron_expression: triggerType === 'cron' ? cronExpression : '',
            task_title_template: taskTitleTemplate,
            task_description_template: taskDescTemplate,
        }
    }

    // ─── Navigation ─────────────────────────────────────────────────────────

    const stepIdx = STEP_ORDER.indexOf(step)

    const canAdvance = (): boolean => {
        switch (step) {
            case 'agents':
                return selectedAgentIds.length > 0
            case 'variables':
                return true
            case 'metadata':
                return name.trim().length > 0 && description.trim().length > 0
            default:
                return false
        }
    }

    const handleNext = () => {
        if (step === 'agents') {
            // Auto-scan variables when moving to variables step
            const agentDefs = buildAgentDefs()
            const teamDef = buildTeamDef()
            const triggerDef = buildTriggerDef()
            const foundKeys = scanForVariables(agentDefs, teamDef, triggerDef)

            // Preserve any existing variable definitions, add new ones
            const existingKeys = new Set(variables.map((v) => v.key))
            const newVars: TemplateVariable[] = foundKeys
                .filter((k) => !existingKeys.has(k))
                .map((key) => ({
                    key,
                    label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
                    type: 'text' as const,
                    placeholder: '',
                    required: true,
                    default: '',
                }))

            setVariables([...variables, ...newVars])
        }

        const nextIdx = stepIdx + 1
        if (nextIdx < STEP_ORDER.length) {
            setStep(STEP_ORDER[nextIdx])
        }
    }

    const handleBack = () => {
        const prevIdx = stepIdx - 1
        if (prevIdx >= 0) {
            setStep(STEP_ORDER[prevIdx])
        }
    }

    const handlePublish = () => {
        if (!workspaceId) return

        const definition: TemplateDefinition = {
            agents: buildAgentDefs(),
            team: buildTeamDef(),
            trigger: buildTriggerDef(),
        }

        createMutation.mutate(
            {
                workspace_id: workspaceId,
                name,
                description,
                readme: readme || undefined,
                category,
                tags,
                icon,
                template_definition: definition,
                variables,
                is_published: isPublished,
            },
            { onSuccess: () => setPublished(true) },
        )
    }

    // ─── Toggle helpers ─────────────────────────────────────────────────────

    const toggleAgent = (id: string) => {
        setSelectedAgentIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        )
    }

    const addTag = () => {
        const t = tagInput.trim().toLowerCase()
        if (t && !tags.includes(t)) setTags([...tags, t])
        setTagInput('')
    }

    const updateVariable = (idx: number, updates: Partial<TemplateVariable>) => {
        setVariables((prev) =>
            prev.map((v, i) => (i === idx ? { ...v, ...updates } : v)),
        )
    }

    const removeVariable = (idx: number) => {
        setVariables((prev) => prev.filter((_, i) => i !== idx))
    }

    const addVariable = () => {
        setVariables([
            ...variables,
            { key: '', label: '', type: 'text', placeholder: '', required: true, default: '' },
        ])
    }

    if (!open) return null

    // ─── Success State ──────────────────────────────────────────────────────
    if (published) {
        return (
            <SlidePanel open onClose={onClose}>
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <CheckCircle2 className="mb-4 h-16 w-16 text-green-400" />
                    <h2 className="text-xl font-bold text-gray-100">Template Created!</h2>
                    <p className="mt-2 text-sm text-gray-400">
                        Your template &quot;{name}&quot; is now {isPublished ? 'live in the marketplace' : 'saved as a draft'}.
                    </p>
                    <button
                        type="button"
                        onClick={onClose}
                        className="mt-6 rounded-lg bg-brand-primary px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-primary/90"
                    >
                        Done
                    </button>
                </div>
            </SlidePanel>
        )
    }

    return (
        <SlidePanel
            open
            onClose={onClose}
            footer={
                <div className="flex items-center gap-2">
                    {stepIdx > 0 && (
                        <button
                            type="button"
                            onClick={handleBack}
                            className="flex items-center gap-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200"
                        >
                            <ChevronLeft className="h-4 w-4" /> Back
                        </button>
                    )}
                    <div className="flex-1" />
                    {step === 'preview' ? (
                        <button
                            type="button"
                            onClick={handlePublish}
                            disabled={createMutation.isPending}
                            className="flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
                        >
                            {createMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Sparkles className="h-4 w-4" />
                            )}
                            {isPublished ? 'Publish Template' : 'Save as Draft'}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleNext}
                            disabled={!canAdvance()}
                            className="flex items-center gap-1 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
                        >
                            Next <ChevronRight className="h-4 w-4" />
                        </button>
                    )}
                </div>
            }
        >
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                    <LayoutTemplate className="h-5 w-5 text-brand-primary" />
                    <h2 className="text-lg font-bold text-gray-100">Create Template</h2>
                </div>
                {/* Progress */}
                <div className="flex items-center gap-1">
                    {STEP_ORDER.map((s, i) => (
                        <div
                            key={s}
                            className={cn(
                                'h-1 flex-1 rounded-full transition-colors',
                                i <= stepIdx ? 'bg-brand-primary' : 'bg-gray-700',
                            )}
                        />
                    ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                    Step {stepIdx + 1} of {STEP_ORDER.length}
                    {' — '}
                    {step === 'agents' && 'Select agents & team'}
                    {step === 'variables' && 'Define template variables'}
                    {step === 'metadata' && 'Add metadata & trigger'}
                    {step === 'preview' && 'Review & publish'}
                </p>
            </div>

            {/* Error */}
            {createMutation.isError && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to create template.'}
                </div>
            )}

            {/* ─── Step 1: Select Agents & Team ────────────────────────── */}
            {step === 'agents' && (
                <div className="space-y-4">
                    <div>
                        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                            Select Agents
                        </h3>
                        <p className="mb-3 text-xs text-gray-500">
                            Choose which agents to include in this template. Their prompts will become the blueprint.
                        </p>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {workspaceAgents.map((agent) => {
                                const selected = selectedAgentIds.includes(agent.id)
                                return (
                                    <button
                                        key={agent.id}
                                        type="button"
                                        onClick={() => toggleAgent(agent.id)}
                                        className={cn(
                                            'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                                            selected
                                                ? 'border-brand-primary bg-brand-primary/5'
                                                : 'border-border hover:border-gray-600',
                                        )}
                                    >
                                        <Bot className={cn('h-4 w-4', selected ? 'text-brand-primary' : 'text-gray-500')} />
                                        <div className="min-w-0 flex-1">
                                            <p className={cn('text-sm font-medium', selected ? 'text-brand-primary' : 'text-gray-200')}>
                                                {agent.name}
                                            </p>
                                            <p className="truncate text-xs text-gray-500">{agent.description}</p>
                                        </div>
                                        <div className={cn(
                                            'flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors',
                                            selected
                                                ? 'border-brand-primary bg-brand-primary'
                                                : 'border-gray-600',
                                        )}>
                                            {selected && <CheckCircle2 className="h-3 w-3 text-black" />}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Team Selection */}
                    {workspaceTeams.length > 0 && (
                        <div>
                            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                                Include Team (optional)
                            </h3>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                <button
                                    type="button"
                                    onClick={() => setSelectedTeamId(null)}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                                        !selectedTeamId
                                            ? 'border-brand-primary bg-brand-primary/5'
                                            : 'border-border hover:border-gray-600',
                                    )}
                                >
                                    <X className="h-4 w-4 text-gray-500" />
                                    <span className="text-sm text-gray-400">No team — agents only</span>
                                </button>
                                {workspaceTeams.map((team) => {
                                    const selected = selectedTeamId === team.id
                                    return (
                                        <button
                                            key={team.id}
                                            type="button"
                                            onClick={() => setSelectedTeamId(team.id)}
                                            className={cn(
                                                'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                                                selected
                                                    ? 'border-brand-primary bg-brand-primary/5'
                                                    : 'border-border hover:border-gray-600',
                                            )}
                                        >
                                            <Users2 className={cn('h-4 w-4', selected ? 'text-purple-400' : 'text-gray-500')} />
                                            <div className="min-w-0 flex-1">
                                                <p className={cn('text-sm font-medium', selected ? 'text-gray-100' : 'text-gray-200')}>
                                                    {team.name}
                                                </p>
                                                <p className="text-xs text-gray-500">{team.mode} team</p>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ─── Step 2: Variables ────────────────────────────────────── */}
            {step === 'variables' && (
                <div className="space-y-4">
                    <div>
                        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                            <Variable className="h-4 w-4" />
                            Template Variables
                        </h3>
                        <p className="mb-3 text-xs text-gray-500">
                            Variables are placeholders in your agent prompts using <code className="rounded bg-surface-card px-1 py-0.5 text-brand-primary">{'{{variable_name}}'}</code> syntax.
                            Users fill these in when installing your template.
                        </p>
                    </div>

                    {variables.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border py-6 text-center">
                            <Variable className="mx-auto mb-2 h-8 w-8 text-gray-600" />
                            <p className="text-xs text-gray-500">
                                No variables detected. Add <code className="rounded bg-surface-card px-1 py-0.5 text-brand-primary">{'{{variable}}'}</code> to your agent prompts,
                                or add custom variables below.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {variables.map((v, idx) => (
                                <div key={idx} className="rounded-lg border border-border bg-surface-overlay p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <code className="rounded bg-surface-card px-2 py-0.5 text-xs font-bold text-brand-primary">
                                            {`{{${v.key || '...'}}}`}
                                        </code>
                                        <button
                                            type="button"
                                            onClick={() => removeVariable(idx)}
                                            className="rounded p-1 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="text"
                                            value={v.key}
                                            onChange={(e) => updateVariable(idx, { key: e.target.value.replace(/\s+/g, '_').toLowerCase() })}
                                            placeholder="variable_key"
                                            className="rounded-md border border-border bg-surface-card px-3 py-1.5 font-mono text-xs text-gray-200 outline-none focus:border-brand-primary"
                                        />
                                        <input
                                            type="text"
                                            value={v.label}
                                            onChange={(e) => updateVariable(idx, { label: e.target.value })}
                                            placeholder="Display Label"
                                            className="rounded-md border border-border bg-surface-card px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-brand-primary"
                                        />
                                        <input
                                            type="text"
                                            value={v.placeholder}
                                            onChange={(e) => updateVariable(idx, { placeholder: e.target.value })}
                                            placeholder="Placeholder text"
                                            className="rounded-md border border-border bg-surface-card px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-brand-primary"
                                        />
                                        <input
                                            type="text"
                                            value={v.default}
                                            onChange={(e) => updateVariable(idx, { default: e.target.value })}
                                            placeholder="Default value"
                                            className="rounded-md border border-border bg-surface-card px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-brand-primary"
                                        />
                                    </div>
                                    <label className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                                        <input
                                            type="checkbox"
                                            checked={v.required}
                                            onChange={(e) => updateVariable(idx, { required: e.target.checked })}
                                            className="rounded border-gray-600 accent-brand-primary"
                                        />
                                        Required
                                    </label>
                                </div>
                            ))}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={addVariable}
                        className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-gray-400 transition-colors hover:border-brand-primary/40 hover:text-brand-primary"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add Variable
                    </button>
                </div>
            )}

            {/* ─── Step 3: Metadata ────────────────────────────────────── */}
            {step === 'metadata' && (
                <div className="space-y-4">
                    {/* Icon + Name */}
                    <div className="flex gap-3">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-400">Icon</label>
                            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-card p-2 w-32">
                                {ICON_OPTIONS.map((ic) => (
                                    <button
                                        key={ic}
                                        type="button"
                                        onClick={() => setIcon(ic)}
                                        className={cn(
                                            'rounded-md p-1 text-lg transition-colors',
                                            icon === ic ? 'bg-brand-primary/20 ring-1 ring-brand-primary' : 'hover:bg-surface-elevated',
                                        )}
                                    >
                                        {ic}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex-1">
                            <label className="mb-1.5 block text-xs font-medium text-gray-400">
                                Template Name <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Weekly Sports Coach"
                                className="w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-400">
                            Description <span className="text-red-400">*</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            placeholder="What does this template do? Who is it for?"
                            className="w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-400">Category</label>
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-brand-primary"
                        >
                            {CATEGORY_OPTIONS.map((c) => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-400">Tags</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                                placeholder="Add tag + Enter"
                                className="flex-1 rounded-lg border border-border bg-surface-card px-3 py-2 text-xs text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary"
                            />
                        </div>
                        {tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {tags.map((t) => (
                                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-gray-400">
                                        {t}
                                        <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="hover:text-red-400">
                                            <X className="h-2.5 w-2.5" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* README */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-400">README (optional)</label>
                        <textarea
                            value={readme}
                            onChange={(e) => setReadme(e.target.value)}
                            rows={4}
                            placeholder="Detailed instructions, use cases, tips..."
                            className="w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 font-mono text-xs text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary"
                        />
                    </div>

                    {/* Trigger */}
                    <div className="rounded-lg border border-border bg-surface-card p-4">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                            <input
                                type="checkbox"
                                checked={enableTrigger}
                                onChange={(e) => setEnableTrigger(e.target.checked)}
                                className="accent-brand-primary"
                            />
                            <Clock className="h-4 w-4" />
                            Include Trigger
                        </label>
                        {enableTrigger && (
                            <div className="mt-3 space-y-3 pl-6">
                                <div className="flex gap-2">
                                    <select
                                        value={triggerType}
                                        onChange={(e) => setTriggerType(e.target.value as 'cron' | 'webhook')}
                                        className="rounded-lg border border-border bg-surface-overlay px-3 py-2 text-xs text-gray-200 outline-none"
                                    >
                                        <option value="cron">CRON Schedule</option>
                                        <option value="webhook">Webhook</option>
                                    </select>
                                    {triggerType === 'cron' && (
                                        <>
                                            <input
                                                type="text"
                                                value={cronExpression}
                                                onChange={(e) => setCronExpression(e.target.value)}
                                                placeholder="0 9 * * 5"
                                                className="flex-1 rounded-lg border border-border bg-surface-overlay px-3 py-2 font-mono text-xs text-gray-200 outline-none focus:border-brand-primary"
                                            />
                                        </>
                                    )}
                                </div>
                                {triggerType === 'cron' && cronExpression.trim().split(/\s+/).length === 5 && (
                                    <p className="-mt-1 text-xs text-brand-primary">
                                        → {cronToHuman(cronExpression)}
                                    </p>
                                )}
                                <input
                                    type="text"
                                    value={taskTitleTemplate}
                                    onChange={(e) => setTaskTitleTemplate(e.target.value)}
                                    placeholder="Task title (e.g. Weekly {{sport}} Coaching)"
                                    className="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-xs text-gray-200 outline-none focus:border-brand-primary"
                                />
                                <input
                                    type="text"
                                    value={taskDescTemplate}
                                    onChange={(e) => setTaskDescTemplate(e.target.value)}
                                    placeholder="Task description template"
                                    className="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-xs text-gray-200 outline-none focus:border-brand-primary"
                                />
                            </div>
                        )}
                    </div>

                    {/* Publish toggle */}
                    <label className="flex items-center gap-2 text-sm text-gray-300">
                        <input
                            type="checkbox"
                            checked={isPublished}
                            onChange={(e) => setIsPublished(e.target.checked)}
                            className="accent-brand-primary"
                        />
                        Publish to marketplace immediately
                    </label>
                </div>
            )}

            {/* ─── Step 4: Preview ─────────────────────────────────────── */}
            {step === 'preview' && (
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Preview</h3>

                    {/* Template header */}
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-card p-4">
                        <span className="text-3xl">{icon}</span>
                        <div>
                            <h4 className="text-base font-bold text-gray-100">{name || 'Untitled'}</h4>
                            <p className="text-xs text-gray-500">{category}</p>
                        </div>
                    </div>

                    <p className="text-sm text-gray-300">{description}</p>

                    {/* Contents */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase text-gray-500">Includes</h4>
                        {selectedAgents.map((a) => (
                            <div key={a.id} className="flex items-center gap-2 rounded bg-surface-overlay p-2">
                                <Bot className="h-3.5 w-3.5 text-brand-primary" />
                                <span className="text-xs font-medium text-gray-200">{a.name}</span>
                                <span className="text-xs text-gray-500">{a.provider} · {a.model}</span>
                            </div>
                        ))}
                        {selectedTeam && (
                            <div className="flex items-center gap-2 rounded bg-surface-overlay p-2">
                                <Users2 className="h-3.5 w-3.5 text-purple-400" />
                                <span className="text-xs font-medium text-gray-200">{selectedTeam.name}</span>
                                <span className="text-xs text-gray-500">{selectedTeam.mode}</span>
                            </div>
                        )}
                        {enableTrigger && (
                            <div className="flex items-center gap-2 rounded bg-surface-overlay p-2">
                                <Clock className="h-3.5 w-3.5 text-blue-400" />
                                <span className="text-xs font-medium text-gray-200">
                                    {triggerType === 'cron' ? cronToHuman(cronExpression) : 'Webhook'}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Variables summary */}
                    {variables.length > 0 && (
                        <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">Variables</h4>
                            <div className="grid grid-cols-2 gap-2">
                                {variables.map((v) => (
                                    <div key={v.key} className="rounded bg-surface-overlay p-2">
                                        <code className="text-xs font-bold text-brand-primary">{`{{${v.key}}}`}</code>
                                        <p className="text-xs text-gray-400">{v.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tags */}
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {tags.map((t) => (
                                <span key={t} className="rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-gray-400">{t}</span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </SlidePanel>
    )
}
