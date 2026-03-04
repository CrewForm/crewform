// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Loader2, GitBranch, Sparkles } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useCreateTeam } from '@/hooks/useCreateTeam'
import { useEELicense } from '@/hooks/useEELicense'
import { getMinPlanLabel } from '@/lib/featureFlags'
import type { TeamMode, PipelineConfig, OrchestratorConfig, CollaborationConfig } from '@/types'

interface CreateTeamModalProps {
    onClose: () => void
}

interface ModeOption {
    value: TeamMode
    label: string
    icon: typeof GitBranch
    description: string
    eeFeature?: string  // if set, requires EE license
}

const MODES: ModeOption[] = [
    {
        value: 'pipeline',
        label: 'Pipeline',
        icon: GitBranch,
        description: 'Agents execute in sequence, each passing output to the next.',
    },
    {
        value: 'orchestrator',
        label: 'Orchestrator',
        icon: GitBranch,
        description: 'A brain agent delegates sub-tasks to specialist agents.',
        eeFeature: 'orchestrator_mode',
    },
    {
        value: 'collaboration',
        label: 'Collaboration',
        icon: GitBranch,
        description: 'Agents discuss and converge on a consensus output.',
        eeFeature: 'collaboration_mode',
    },
]

/**
 * Modal for creating a new team.
 * Pipeline is the only available mode for MVP.
 */
export function CreateTeamModal({ onClose }: CreateTeamModalProps) {
    const navigate = useNavigate()
    const { workspaceId } = useWorkspace()
    const createMutation = useCreateTeam()
    const { hasFeature } = useEELicense(workspaceId ?? undefined)

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [mode, setMode] = useState<TeamMode>('pipeline')
    const [nameError, setNameError] = useState('')

    // Check which modes are available based on the workspace license
    const modesWithAvailability = useMemo(() =>
        MODES.map(m => ({
            ...m,
            available: m.eeFeature ? hasFeature(m.eeFeature) : true,
        })),
        [hasFeature],
    )

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()

        const trimmed = name.trim()
        if (!trimmed) {
            setNameError('Team name is required')
            return
        }
        if (trimmed.length > 100) {
            setNameError('Team name must be 100 characters or less')
            return
        }

        const defaultConfig = mode === 'orchestrator'
            ? {
                brain_agent_id: '',
                quality_threshold: 0.7,
                routing_strategy: 'auto',
                planner_enabled: false,
                max_delegation_depth: 3,
            }
            : mode === 'collaboration'
                ? {
                    agent_ids: [] as string[],
                    speaker_selection: 'round_robin',
                    max_turns: 10,
                    termination_condition: 'max_turns',
                    consensus_phrase: 'I agree with the consensus',
                } as CollaborationConfig
                : {
                    steps: [] as PipelineConfig['steps'],
                    auto_handoff: true,
                }

        createMutation.mutate(
            {
                workspace_id: workspaceId ?? '',
                name: trimmed,
                description: description.trim(),
                mode,
                config: defaultConfig as PipelineConfig | OrchestratorConfig | CollaborationConfig,
            },
            {
                onSuccess: (team) => {
                    onClose()
                    navigate(`/teams/${team.id}`)
                },
            },
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

            {/* Modal */}
            <div className="relative w-full max-w-lg rounded-xl border border-border bg-surface-primary p-6 shadow-2xl">
                {/* Close button */}
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-surface-elevated hover:text-gray-300"
                    aria-label="Close"
                >
                    <X className="h-5 w-5" />
                </button>

                <h2 className="mb-1 text-xl font-semibold text-gray-100">Create Team</h2>
                <p className="mb-6 text-sm text-gray-500">
                    Teams let multiple agents work together to solve complex tasks.
                </p>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Name */}
                    <div>
                        <label htmlFor="team-name" className="mb-1.5 block text-sm font-medium text-gray-300">
                            Team Name <span className="text-red-400">*</span>
                        </label>
                        <input
                            id="team-name"
                            type="text"
                            value={name}
                            onChange={(e) => { setName(e.target.value); setNameError('') }}
                            placeholder="e.g. Blog Content Pipeline"
                            className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-brand-primary"
                            autoFocus
                        />
                        {nameError && <p className="mt-1 text-xs text-red-400">{nameError}</p>}
                    </div>

                    {/* Description */}
                    <div>
                        <label htmlFor="team-description" className="mb-1.5 block text-sm font-medium text-gray-300">
                            Description
                        </label>
                        <textarea
                            id="team-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What does this team do?"
                            rows={2}
                            className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-brand-primary resize-none"
                        />
                    </div>

                    {/* Mode selector */}
                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-300">
                            Team Mode
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                            {modesWithAvailability.map((m) => (
                                <div
                                    key={m.value}
                                    className={`relative flex items-start gap-3 rounded-lg border p-3 transition-colors ${m.value === mode
                                        ? 'border-brand-primary bg-brand-muted/30'
                                        : m.available
                                            ? 'border-border hover:border-gray-600 cursor-pointer'
                                            : 'border-border opacity-50 cursor-not-allowed'
                                        }`}
                                    onClick={() => { if (m.available) setMode(m.value) }}
                                >
                                    <m.icon className={`mt-0.5 h-4 w-4 ${m.value === mode ? 'text-brand-primary' : 'text-gray-500'}`} />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-medium ${m.value === mode ? 'text-brand-primary' : 'text-gray-300'}`}>
                                                {m.label}
                                            </span>
                                            {!m.available && m.eeFeature && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500/20 to-indigo-500/20 border border-violet-500/30 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                                                    <Sparkles className="h-2.5 w-2.5" />
                                                    {getMinPlanLabel(m.eeFeature)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-xs text-gray-500">{m.description}</p>
                                    </div>
                                    {m.value === mode && (
                                        <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-brand-primary" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Error */}
                    {createMutation.isError && (
                        <p className="text-xs text-red-400">
                            {createMutation.error.message || 'Failed to create team'}
                        </p>
                    )}

                    {/* Submit */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:text-gray-200"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={createMutation.isPending}
                            className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                        >
                            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                            Create Team
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
