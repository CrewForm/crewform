// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useCallback } from 'react'
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable'
import { Plus, Save, Loader2, AlertCircle } from 'lucide-react'
import { PipelineStepCard } from '@/components/teams/PipelineStepCard'
import { ChannelSelector } from '@/components/shared/ChannelSelector'
import { useUpdateTeam } from '@/hooks/useUpdateTeam'
import type { Agent, Team, PipelineConfig, PipelineStep } from '@/types'
import type { PipelineStepFormData } from '@/lib/teamSchema'

type StepWithId = PipelineStepFormData & { _id: string }

interface PipelineConfigPanelProps {
    team: Team
    agents: Agent[]
}

let nextStepId = 0
function genStepId() {
    nextStepId += 1
    return `step-${nextStepId}-${Date.now()}`
}

/** Convert saved PipelineStep[] into local form state with _id */
function hydrate(steps: PipelineStep[]): StepWithId[] {
    return steps.map((s) => ({
        _id: genStepId(),
        agent_id: s.agent_id,
        step_name: s.step_name,
        instructions: s.instructions,
        expected_output: s.expected_output,
        on_failure: s.on_failure,
        max_retries: s.max_retries,
    }))
}

/** Strip _id before saving */
function dehydrate(steps: StepWithId[]): PipelineStep[] {
    return steps.map((s) => ({
        agent_id: s.agent_id,
        step_name: s.step_name,
        instructions: s.instructions,
        expected_output: s.expected_output,
        on_failure: s.on_failure,
        max_retries: s.max_retries,
    }))
}

/**
 * Pipeline configuration panel.
 * Add, reorder (drag), edit, and delete pipeline steps.
 */
export function PipelineConfigPanel({ team, agents }: PipelineConfigPanelProps) {
    const config = team.config as PipelineConfig
    const [steps, setSteps] = useState<StepWithId[]>(() => hydrate(config.steps))
    const [hasChanges, setHasChanges] = useState(false)
    const [validationError, setValidationError] = useState('')
    const [outputRouteIds, setOutputRouteIds] = useState<string[] | null>(team.output_route_ids ?? null)

    const updateMutation = useUpdateTeam()

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    )

    // ─── Step CRUD ───────────────────────────────────────────────────────────

    function addStep() {
        const newStep: StepWithId = {
            _id: genStepId(),
            agent_id: '',
            step_name: `Step ${steps.length + 1}`,
            instructions: '',
            expected_output: '',
            on_failure: 'stop',
            max_retries: 1,
        }
        setSteps([...steps, newStep])
        setHasChanges(true)
        setValidationError('')
    }

    const updateStep = useCallback((id: string, updates: Partial<PipelineStepFormData>) => {
        setSteps((prev) =>
            prev.map((s) => (s._id === id ? { ...s, ...updates } : s)),
        )
        setHasChanges(true)
        setValidationError('')
    }, [])

    const deleteStep = useCallback((id: string) => {
        setSteps((prev) => prev.filter((s) => s._id !== id))
        setHasChanges(true)
        setValidationError('')
    }, [])

    // ─── Drag & Drop ─────────────────────────────────────────────────────────

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return

        setSteps((prev) => {
            const oldIndex = prev.findIndex((s) => s._id === active.id)
            const newIndex = prev.findIndex((s) => s._id === over.id)
            return arrayMove(prev, oldIndex, newIndex)
        })
        setHasChanges(true)
    }

    // ─── Save ────────────────────────────────────────────────────────────────

    function handleSave() {
        // Validate
        if (steps.length < 1) {
            setValidationError('Add at least one step to your pipeline.')
            return
        }

        const missingAgent = steps.find((s) => !s.agent_id)
        if (missingAgent) {
            setValidationError(`Step "${missingAgent.step_name || 'unnamed'}" needs an agent assigned.`)
            return
        }

        const missingName = steps.find((s) => !s.step_name.trim())
        if (missingName) {
            setValidationError('All steps must have a name.')
            return
        }

        const updatedConfig: PipelineConfig = {
            ...config,
            steps: dehydrate(steps),
        }

        updateMutation.mutate(
            { id: team.id, updates: { config: updatedConfig, output_route_ids: outputRouteIds } },
            {
                onSuccess: () => {
                    setHasChanges(false)
                    setValidationError('')
                },
            },
        )
    }

    return (
        <div>
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-medium text-gray-300">Pipeline Steps</h3>
                    <p className="text-xs text-gray-500">
                        Drag to reorder. Each agent runs in sequence, passing output to the next.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={addStep}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-brand-primary hover:text-brand-primary"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add Step
                    </button>
                    {hasChanges && (
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={updateMutation.isPending}
                            className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
                        >
                            {updateMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Save className="h-3.5 w-3.5" />
                            )}
                            Save Pipeline
                        </button>
                    )}
                </div>
            </div>

            {/* Validation error */}
            {validationError && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5">
                    <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                    <p className="text-xs text-red-400">{validationError}</p>
                </div>
            )}

            {/* Save error */}
            {updateMutation.isError && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5">
                    <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                    <p className="text-xs text-red-400">
                        {updateMutation.error.message || 'Failed to save pipeline configuration.'}
                    </p>
                </div>
            )}

            {/* Steps list */}
            {steps.length > 0 ? (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={steps.map((s) => s._id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                            {steps.map((step, index) => (
                                <PipelineStepCard
                                    key={step._id}
                                    step={step}
                                    index={index}
                                    agents={agents}
                                    onUpdate={updateStep}
                                    onDelete={deleteStep}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12">
                    <p className="mb-3 text-sm text-gray-500">No steps configured yet.</p>
                    <button
                        type="button"
                        onClick={addStep}
                        className="flex items-center gap-2 rounded-lg bg-brand-muted px-4 py-2 text-sm font-medium text-brand-primary transition-colors hover:bg-brand-primary hover:text-black"
                    >
                        <Plus className="h-4 w-4" />
                        Add First Step
                    </button>
                </div>
            )}

            {/* Output Channels */}
            <div className="mt-6">
                <ChannelSelector
                    value={outputRouteIds}
                    onChange={(ids) => { setOutputRouteIds(ids); setHasChanges(true) }}
                />
            </div>
        </div>
    )
}
