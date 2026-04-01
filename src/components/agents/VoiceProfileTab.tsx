// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect } from 'react'
import { Loader2, Save, Trash2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
    fetchVoiceProfiles,
    createVoiceProfile,
    assignVoiceProfileToAgent,
} from '@/db/voiceProfiles'
import type { VoiceProfile, VoiceProfileTone, VoiceProfileInline } from '@/types'

const TONE_PRESETS: { value: VoiceProfileTone; label: string; description: string }[] = [
    { value: 'formal', label: 'Formal', description: 'Professional, structured, precise' },
    { value: 'casual', label: 'Casual', description: 'Friendly, conversational, approachable' },
    { value: 'technical', label: 'Technical', description: 'Detailed, accurate, documentation-style' },
    { value: 'creative', label: 'Creative', description: 'Expressive, engaging, vivid language' },
    { value: 'empathetic', label: 'Empathetic', description: 'Warm, supportive, understanding' },
    { value: 'custom', label: 'Custom', description: 'Define your own tone' },
]

interface VoiceProfileTabProps {
    agentId: string
    workspaceId: string
    /** Current inline voice profile from the agent record */
    currentProfile: VoiceProfileInline | null
    /** Currently assigned voice profile ID (FK → voice_profiles) */
    currentProfileId: string | null
    /** Callback when voice settings are changed (for dirty tracking) */
    onChanged: () => void
    /** Callback after a successful save to reset parent dirty state */
    onSaved: () => void
}

export function VoiceProfileTab({ agentId, workspaceId, currentProfile, currentProfileId, onChanged, onSaved }: VoiceProfileTabProps) {
    // Local state for the form
    const [tone, setTone] = useState<VoiceProfileTone>(currentProfile?.tone ?? 'casual')
    const [customInstructions, setCustomInstructions] = useState(currentProfile?.custom_instructions ?? '')
    const [outputFormatHints, setOutputFormatHints] = useState(currentProfile?.output_format_hints ?? '')
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(currentProfileId)

    // Workspace voice profile templates
    const [templates, setTemplates] = useState<VoiceProfile[]>([])
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isSavingTemplate, setIsSavingTemplate] = useState(false)
    const [templateName, setTemplateName] = useState('')
    const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false)

    // Load workspace templates
    useEffect(() => {
        async function load() {
            try {
                const profiles = await fetchVoiceProfiles(workspaceId)
                setTemplates(profiles.filter(p => p.is_template))
            } catch (err) {
                console.error('[VoiceProfileTab] Failed to load templates:', err)
            } finally {
                setIsLoadingTemplates(false)
            }
        }
        void load()
    }, [workspaceId])

    // Apply a template to the form
    function applyTemplate(templateId: string) {
        const template = templates.find(t => t.id === templateId)
        if (!template) return
        setTone(template.tone)
        setCustomInstructions(template.custom_instructions ?? '')
        setOutputFormatHints(template.output_format_hints ?? '')
        setSelectedTemplateId(templateId)
        onChanged()
    }

    // Save inline voice profile to agent
    async function handleSave() {
        setIsSaving(true)
        try {
            // Update inline voice_profile JSONB on agent
            const { supabase } = await import('@/lib/supabase')
            const voiceProfile: VoiceProfileInline = {
                tone,
                custom_instructions: customInstructions || undefined,
                output_format_hints: outputFormatHints || undefined,
            }

            const { error } = await supabase
                .from('agents')
                .update({
                    voice_profile: voiceProfile,
                    voice_profile_id: selectedTemplateId,
                })
                .eq('id', agentId)

            if (error) throw error

            toast.success('Voice profile saved')
            onSaved()
        } catch (err) {
            console.error('[VoiceProfileTab] Save failed:', err)
            toast.error('Failed to save voice profile')
        } finally {
            setIsSaving(false)
        }
    }

    // Remove voice profile from agent
    async function handleRemove() {
        setIsSaving(true)
        try {
            const { supabase } = await import('@/lib/supabase')
            const { error } = await supabase
                .from('agents')
                .update({ voice_profile: null, voice_profile_id: null })
                .eq('id', agentId)

            if (error) throw error

            setTone('casual')
            setCustomInstructions('')
            setOutputFormatHints('')
            setSelectedTemplateId(null)
            toast.success('Voice profile removed')
            onSaved()
        } catch (err) {
            console.error('[VoiceProfileTab] Remove failed:', err)
            toast.error('Failed to remove voice profile')
        } finally {
            setIsSaving(false)
        }
    }

    // Save current settings as a reusable workspace template
    async function handleSaveAsTemplate() {
        if (!templateName.trim()) return
        setIsSavingTemplate(true)
        try {
            const profile = await createVoiceProfile({
                workspace_id: workspaceId,
                name: templateName.trim(),
                tone,
                custom_instructions: customInstructions || null,
                output_format_hints: outputFormatHints || null,
                is_template: true,
            })
            setTemplates(prev => [...prev, profile])
            setSelectedTemplateId(profile.id)
            setShowSaveAsTemplate(false)
            setTemplateName('')
            toast.success(`Template "${profile.name}" created`)

            // Also assign to the agent
            await assignVoiceProfileToAgent(agentId, profile.id)
        } catch (err) {
            console.error('[VoiceProfileTab] Template save failed:', err)
            toast.error('Failed to save template')
        } finally {
            setIsSavingTemplate(false)
        }
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            {/* Tone Presets */}
            <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                    Tone Preset
                </label>
                <div className="flex flex-wrap gap-2">
                    {TONE_PRESETS.map((preset) => (
                        <button
                            key={preset.value}
                            type="button"
                            onClick={() => { setTone(preset.value); onChanged() }}
                            className={cn(
                                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                                tone === preset.value
                                    ? 'border-brand-primary bg-brand-muted/20 text-brand-primary'
                                    : 'border-border text-gray-400 hover:border-gray-500 hover:text-gray-300',
                            )}
                            title={preset.description}
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                    {TONE_PRESETS.find(p => p.value === tone)?.description}
                </p>
            </div>

            {/* Custom Instructions */}
            <div>
                <label htmlFor="voice-instructions" className="mb-1.5 block text-sm font-medium text-gray-300">
                    Custom Voice Instructions
                </label>
                <textarea
                    id="voice-instructions"
                    value={customInstructions}
                    onChange={(e) => { setCustomInstructions(e.target.value); onChanged() }}
                    placeholder={`e.g. Always refer to customers as 'members'. Use active voice. Avoid jargon.`}
                    rows={4}
                    maxLength={2000}
                    className="w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                />
                <div className="mt-1 flex justify-between">
                    <p className="text-xs text-gray-500">
                        These instructions are injected into the system prompt as a &quot;Voice &amp; Tone&quot; section.
                    </p>
                    <span className="text-xs text-gray-600">
                        {customInstructions.length.toLocaleString()} / 2,000
                    </span>
                </div>
            </div>

            {/* Output Format Hints */}
            <div>
                <label htmlFor="voice-format" className="mb-1.5 block text-sm font-medium text-gray-300">
                    Output Format Hints <span className="text-xs text-gray-500">(optional)</span>
                </label>
                <textarea
                    id="voice-format"
                    value={outputFormatHints}
                    onChange={(e) => { setOutputFormatHints(e.target.value); onChanged() }}
                    placeholder="e.g. Use numbered lists for steps. Keep responses under 200 words."
                    rows={2}
                    maxLength={500}
                    className="w-full rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                />
                <div className="mt-1 flex justify-end">
                    <span className="text-xs text-gray-600">
                        {outputFormatHints.length} / 500
                    </span>
                </div>
            </div>

            {/* Brand Voice Template Selector */}
            <div>
                <label htmlFor="voice-template" className="mb-1.5 block text-sm font-medium text-gray-300">
                    Brand Voice Template
                </label>
                {isLoadingTemplates ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading templates…
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <select
                            id="voice-template"
                            value={selectedTemplateId ?? ''}
                            onChange={(e) => {
                                const val = e.target.value
                                if (val) {
                                    applyTemplate(val)
                                } else {
                                    setSelectedTemplateId(null)
                                    onChanged()
                                }
                            }}
                            className="flex-1 rounded-lg border border-border bg-surface-card px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-brand-primary"
                        >
                            <option value="">None — use inline settings only</option>
                            {templates.map(t => (
                                <option key={t.id} value={t.id}>
                                    {t.name} ({t.tone})
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => setShowSaveAsTemplate(true)}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200"
                        >
                            <Sparkles className="h-3 w-3" />
                            Save as Template
                        </button>
                    </div>
                )}
            </div>

            {/* Save As Template (inline form) */}
            {showSaveAsTemplate && (
                <div className="rounded-lg border border-brand-primary/30 bg-brand-muted/10 p-4">
                    <label htmlFor="template-name" className="mb-1.5 block text-sm font-medium text-gray-300">
                        Template Name
                    </label>
                    <div className="flex gap-2">
                        <input
                            id="template-name"
                            type="text"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            placeholder="e.g. Acme Brand Voice"
                            className="flex-1 rounded-lg border border-border bg-surface-card px-4 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary"
                        />
                        <button
                            type="button"
                            onClick={() => void handleSaveAsTemplate()}
                            disabled={!templateName.trim() || isSavingTemplate}
                            className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSavingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Save
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowSaveAsTemplate(false); setTemplateName('') }}
                            className="rounded-lg border border-border px-3 py-2 text-sm text-gray-400 hover:bg-surface-elevated"
                        >
                            Cancel
                        </button>
                    </div>
                    <p className="mt-1.5 text-xs text-gray-500">
                        Saves the current tone, instructions, and format hints as a reusable workspace template.
                    </p>
                </div>
            )}

            {/* Preview / Info */}
            <div className="rounded-lg border border-border bg-surface-card p-4">
                <h4 className="mb-2 text-sm font-medium text-gray-300">How it works</h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                    When this agent executes a task, the voice profile is injected into the system prompt
                    as a <code className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[11px] text-brand-primary">## Voice &amp; Tone</code> section
                    after the base prompt and before the task instructions. The agent will adapt its output to match
                    the configured tone, custom instructions, and format hints.
                </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-border pt-4">
                <button
                    type="button"
                    onClick={() => void handleRemove()}
                    disabled={isSaving || (!currentProfile && !currentProfileId)}
                    className="flex items-center gap-2 rounded-lg border border-red-600/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-600/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Trash2 className="h-4 w-4" />
                    Remove Voice Profile
                </button>
                <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={isSaving}
                    className="flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Voice Profile
                </button>
            </div>
        </div>
    )
}
