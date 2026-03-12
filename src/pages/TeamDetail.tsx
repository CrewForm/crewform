// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    ArrowLeft,
    GitBranch,
    Trash2,
    Loader2,
    AlertCircle,
    Pencil,
    Check,
    X,
    Play,
    ChevronDown,
} from 'lucide-react'
import { useTeam } from '@/hooks/useTeam'
import { useAgents } from '@/hooks/useAgents'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useUpdateTeam } from '@/hooks/useUpdateTeam'
import { useDeleteTeam } from '@/hooks/useDeleteTeam'
import { useTeamRuns } from '@/hooks/useTeamRuns'
import { useApiKeys } from '@/hooks/useApiKeys'
import { PipelineConfigPanel } from '@/components/teams/PipelineConfigPanel'
import { OrchestratorConfigPanel } from '@/components/teams/OrchestratorConfig'
import { CollaborationConfigPanel } from '@/components/teams/CollaborationConfigPanel'
import { RunTeamModal } from '@/components/teams/RunTeamModal'
import { TeamRunCard } from '@/components/teams/TeamRunCard'
import { TeamTriggersPanel } from '@/components/teams/TeamTriggersPanel'
import { TeamMemoryPanel } from '@/components/teams/TeamMemoryPanel'
import { ChannelSelector } from '@/components/shared/ChannelSelector'
import { EEGate } from '@/components/shared/UpgradeBadge'
import { UpgradeCard } from '@/components/shared/UpgradeBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { PipelineConfig, OrchestratorConfig, CollaborationConfig, TeamMode } from '@/types'

const MODE_BADGE: Record<string, { label: string; className: string }> = {
    pipeline: { label: 'Pipeline', className: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
    orchestrator: { label: 'Orchestrator', className: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
    collaboration: { label: 'Collaboration', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
}

const SWITCHABLE_MODES: { value: TeamMode; label: string }[] = [
    { value: 'pipeline', label: 'Pipeline' },
    { value: 'orchestrator', label: 'Orchestrator' },
    { value: 'collaboration', label: 'Collaboration' },
]

/**
 * Team detail/configuration page.
 * Header with inline-editable name, mode-specific config panel as main content.
 */
export function TeamDetail() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { workspaceId } = useWorkspace()
    const { team, isLoading, error } = useTeam(id ?? null)
    const { agents } = useAgents(workspaceId)
    const updateMutation = useUpdateTeam()
    const deleteMutation = useDeleteTeam()

    // Inline editing state
    const [isEditingName, setIsEditingName] = useState(false)
    const [editName, setEditName] = useState('')
    const [isEditingDesc, setIsEditingDesc] = useState(false)
    const [editDesc, setEditDesc] = useState('')
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showRunModal, setShowRunModal] = useState(false)
    const [showModeDropdown, setShowModeDropdown] = useState(false)
    const [outputRouteIds, setOutputRouteIds] = useState<string[] | null>(null)
    const [channelInitialized, setChannelInitialized] = useState(false)

    const { runs, isLoading: isLoadingRuns } = useTeamRuns(id ?? null)
    const pipelineConfig = team?.mode === 'pipeline' ? (team.config as PipelineConfig) : undefined
    const orchestratorConfig = team?.mode === 'orchestrator' ? (team.config as OrchestratorConfig) : undefined
    const collaborationConfig = team?.mode === 'collaboration' ? (team.config as CollaborationConfig) : undefined
    const stepCount = pipelineConfig?.steps.length ?? 0

    // Initialize output_route_ids from team once loaded
    if (team && !channelInitialized) {
        setOutputRouteIds(team.output_route_ids ?? null)
        setChannelInitialized(true)
    }

    // Check if embedding-capable API keys are configured
    const { keysByProvider } = useApiKeys(workspaceId)
    const hasEmbeddingKey = [...keysByProvider.keys()].some(
        (p) => p.toLowerCase() === 'openai' || p.toLowerCase() === 'openrouter',
    )

    // Close mode dropdown on outside click
    const modeDropdownRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
                setShowModeDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    function startEditName() {
        if (!team) return
        setEditName(team.name)
        setIsEditingName(true)
    }

    function saveName() {
        if (!team || !editName.trim()) return
        updateMutation.mutate(
            { id: team.id, updates: { name: editName.trim() } },
            { onSuccess: () => setIsEditingName(false) },
        )
    }

    function startEditDesc() {
        if (!team) return
        setEditDesc(team.description)
        setIsEditingDesc(true)
    }

    function saveDesc() {
        if (!team) return
        updateMutation.mutate(
            { id: team.id, updates: { description: editDesc.trim() } },
            { onSuccess: () => setIsEditingDesc(false) },
        )
    }

    function handleDelete() {
        if (!team) return
        deleteMutation.mutate(
            { id: team.id, workspaceId: team.workspace_id },
            { onSuccess: () => navigate('/teams') },
        )
    }

    function handleModeSwitch(newMode: TeamMode) {
        if (!team || newMode === team.mode) {
            setShowModeDropdown(false)
            return
        }
        if (!confirm(`Switch this team from ${MODE_BADGE[team.mode].label} to ${MODE_BADGE[newMode].label}? This will reset the team configuration.`)) {
            setShowModeDropdown(false)
            return
        }
        const defaultConfig = newMode === 'orchestrator'
            ? { brain_agent_id: '', quality_threshold: 0.7, routing_strategy: 'auto', planner_enabled: false, max_delegation_depth: 3 }
            : newMode === 'collaboration'
                ? { agent_ids: [], speaker_selection: 'round_robin', max_turns: 10, termination_condition: 'max_turns', consensus_phrase: 'I agree with the consensus' }
                : { steps: [], auto_handoff: true }

        updateMutation.mutate(
            { id: team.id, updates: { mode: newMode, config: defaultConfig as PipelineConfig | OrchestratorConfig | CollaborationConfig } },
            { onSuccess: () => setShowModeDropdown(false) },
        )
    }

    const badge = team ? (MODE_BADGE[team.mode] ?? MODE_BADGE.pipeline) : null

    return (
        <div className="p-6 lg:p-8">
            {/* Back */}
            <button
                type="button"
                onClick={() => navigate('/teams')}
                className="mb-4 flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-300"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Teams
            </button>

            {/* Loading */}
            {isLoading && (
                <div className="space-y-4">
                    <Skeleton className="h-10 w-1/3" />
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-64 w-full rounded-lg" />
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="flex flex-col items-center justify-center py-16">
                    <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
                    <p className="text-sm text-gray-400">Failed to load team</p>
                </div>
            )}

            {/* Content */}
            {team && (
                <>
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-muted">
                                    <GitBranch className="h-6 w-6 text-brand-primary" />
                                </div>
                                <div>
                                    {/* Inline-editable name */}
                                    {isEditingName ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="rounded-lg border border-brand-primary bg-surface-card px-3 py-1 text-xl font-semibold text-gray-100 outline-none"
                                                autoFocus
                                                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setIsEditingName(false) }}
                                            />
                                            <button type="button" onClick={saveName} className="rounded p-1 text-green-400 hover:bg-green-500/10">
                                                <Check className="h-4 w-4" />
                                            </button>
                                            <button type="button" onClick={() => setIsEditingName(false)} className="rounded p-1 text-gray-500 hover:bg-surface-elevated">
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 group">
                                            <h1 className="text-2xl font-semibold text-gray-100">{team.name}</h1>
                                            <button
                                                type="button"
                                                onClick={startEditName}
                                                className="rounded p-1 text-gray-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-gray-400"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    )}

                                    {/* Mode badge (clickable to switch) */}
                                    {badge && (
                                        <div className="relative mt-1" ref={modeDropdownRef}>
                                            <button
                                                type="button"
                                                onClick={() => setShowModeDropdown(!showModeDropdown)}
                                                className={cn(
                                                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80',
                                                    badge.className,
                                                )}
                                            >
                                                {badge.label}
                                                <ChevronDown className="h-2.5 w-2.5" />
                                            </button>
                                            {showModeDropdown && (
                                                <div className="absolute left-0 top-full z-10 mt-1 w-40 rounded-lg border border-border bg-surface-card py-1 shadow-lg">
                                                    {SWITCHABLE_MODES.map((m) => (
                                                        <button
                                                            key={m.value}
                                                            type="button"
                                                            onClick={() => handleModeSwitch(m.value)}
                                                            className={cn(
                                                                'flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-surface-elevated',
                                                                m.value === team.mode ? 'text-brand-primary font-medium' : 'text-gray-400',
                                                            )}
                                                        >
                                                            {m.value === team.mode && <Check className="h-3 w-3" />}
                                                            {m.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-2">
                                {/* Run Team button */}
                                <button
                                    type="button"
                                    onClick={() => setShowRunModal(true)}
                                    disabled={team.mode === 'pipeline' && stepCount === 0}
                                    className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Play className="h-4 w-4" />
                                    Run Team
                                </button>

                                {/* Delete button */}
                                <div className="relative">
                                    {showDeleteConfirm ? (
                                        <div className="flex items-center gap-2 rounded-lg border border-red-600/30 bg-red-600/5 px-3 py-2">
                                            <span className="text-xs text-red-400">Delete this team?</span>
                                            <button
                                                type="button"
                                                onClick={handleDelete}
                                                disabled={deleteMutation.isPending}
                                                className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                            >
                                                {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes, delete'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setShowDeleteConfirm(false)}
                                                className="text-xs text-gray-500 hover:text-gray-300"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setShowDeleteConfirm(true)}
                                            className="rounded-lg border border-red-600/20 p-2 text-gray-600 transition-colors hover:border-red-600/40 hover:text-red-400"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <div className="mt-3">
                            {isEditingDesc ? (
                                <div className="flex items-start gap-2">
                                    <textarea
                                        value={editDesc}
                                        onChange={(e) => setEditDesc(e.target.value)}
                                        rows={2}
                                        className="flex-1 rounded-lg border border-brand-primary bg-surface-card px-3 py-2 text-sm text-gray-300 outline-none resize-none"
                                        autoFocus
                                    />
                                    <button type="button" onClick={saveDesc} className="rounded p-1 text-green-400 hover:bg-green-500/10">
                                        <Check className="h-4 w-4" />
                                    </button>
                                    <button type="button" onClick={() => setIsEditingDesc(false)} className="rounded p-1 text-gray-500 hover:bg-surface-elevated">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="group flex items-start gap-2">
                                    <p className="text-sm text-gray-500">
                                        {team.description || 'No description. Click to add one.'}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={startEditDesc}
                                        className="mt-0.5 rounded p-1 text-gray-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-gray-400"
                                    >
                                        <Pencil className="h-3 w-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Pipeline configuration */}
                    {team.mode === 'pipeline' && (
                        <div className="rounded-xl border border-border bg-surface-card p-6">
                            <PipelineConfigPanel team={team} agents={agents} />
                        </div>
                    )}

                    {/* Orchestrator configuration */}
                    {team.mode === 'orchestrator' && orchestratorConfig && (
                        <div className="rounded-xl border border-border bg-surface-card p-6">
                            <OrchestratorConfigPanel
                                agents={agents}
                                config={{
                                    brain_agent_id: orchestratorConfig.brain_agent_id,
                                    worker_agent_ids: orchestratorConfig.worker_agent_ids ?? [],
                                    quality_threshold: orchestratorConfig.quality_threshold,
                                    max_delegation_depth: orchestratorConfig.max_delegation_depth,
                                }}
                                onChange={(newConfig) => {
                                    updateMutation.mutate({
                                        id: team.id,
                                        updates: {
                                            config: {
                                                ...orchestratorConfig,
                                                brain_agent_id: newConfig.brain_agent_id,
                                                worker_agent_ids: newConfig.worker_agent_ids,
                                                quality_threshold: newConfig.quality_threshold,
                                                max_delegation_depth: newConfig.max_delegation_depth,
                                            },
                                        },
                                    })
                                }}
                            />
                        </div>
                    )}

                    {/* Collaboration configuration */}
                    {team.mode === 'collaboration' && collaborationConfig && (
                        <div className="rounded-xl border border-border bg-surface-card p-6">
                            <CollaborationConfigPanel
                                agents={agents}
                                config={collaborationConfig}
                                onChange={(newConfig) => {
                                    updateMutation.mutate({
                                        id: team.id,
                                        updates: { config: newConfig },
                                    })
                                }}
                            />
                        </div>
                    )}

                    {/* Output Channels (for orchestrator & collaboration — pipeline has its own) */}
                    {team.mode !== 'pipeline' && (
                        <div className="mt-6 rounded-xl border border-border bg-surface-card p-6">
                            <ChannelSelector
                                value={outputRouteIds}
                                onChange={(ids) => {
                                    setOutputRouteIds(ids)
                                    updateMutation.mutate({
                                        id: team.id,
                                        updates: { output_route_ids: ids },
                                    })
                                }}
                            />
                        </div>
                    )}

                    {/* Triggers (EE) */}
                    <EEGate
                        workspaceId={workspaceId ?? undefined}
                        feature="team_triggers"
                        fallback={
                            <div className="mt-8">
                                <UpgradeCard
                                    title="Team Triggers"
                                    description="Schedule teams on a CRON or trigger via webhook. Available on the Pro plan."
                                    planLabel="Pro"
                                />
                            </div>
                        }
                    >
                        <div className="mt-8">
                            <TeamTriggersPanel teamId={team.id} />
                        </div>
                    </EEGate>

                    {/* Knowledge Base (EE — also requires embedding keys) */}
                    <EEGate
                        workspaceId={workspaceId ?? undefined}
                        feature="team_memory"
                        fallback={
                            <div className="mt-8">
                                <UpgradeCard
                                    title="Team Memory"
                                    description="Store and retrieve past run outputs using vector similarity search. Available on the Team plan."
                                    planLabel="Team"
                                />
                            </div>
                        }
                    >
                        {hasEmbeddingKey && (
                            <div className="mt-8">
                                <TeamMemoryPanel teamId={team.id} />
                            </div>
                        )}
                    </EEGate>

                    {/* Recent Runs */}
                    <div className="mt-8">
                        <h2 className="mb-4 text-lg font-semibold text-gray-200">Recent Runs</h2>
                        {isLoadingRuns ? (
                            <div className="space-y-2">
                                <Skeleton className="h-14 w-full rounded-lg" />
                                <Skeleton className="h-14 w-full rounded-lg" />
                            </div>
                        ) : runs.length > 0 ? (
                            <div className="space-y-2">
                                {runs.map((run) => (
                                    <TeamRunCard key={run.id} run={run} teamId={team.id} stepCount={stepCount} />
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed border-border py-8 text-center">
                                <Play className="mx-auto mb-2 h-6 w-6 text-gray-600" />
                                <p className="text-sm text-gray-500">No runs yet</p>
                                <p className="text-xs text-gray-600 mt-1">Click &quot;Run Team&quot; to start your first run.</p>
                            </div>
                        )}
                    </div>

                    {/* Run Team Modal */}
                    {showRunModal && (
                        <RunTeamModal
                            teamId={team.id}
                            teamName={team.name}
                            teamMode={team.mode}
                            onClose={() => setShowRunModal(false)}
                            onCreated={(runId) => navigate(`/teams/${team.id}/runs/${runId}`)}
                        />
                    )}
                </>
            )}
        </div>
    )
}
