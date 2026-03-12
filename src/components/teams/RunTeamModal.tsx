// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Loader2, Play } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useAuth } from '@/hooks/useAuth'
import { useCreateTeamRun } from '@/hooks/useCreateTeamRun'
import { SpeechToTextButton } from '@/components/shared/SpeechToTextButton'
import { FileUploadZone } from '@/components/shared/FileUploadZone'
import { SlidePanel } from '@/components/shared/SlidePanel'
import { uploadAttachments } from '@/db/attachments'

interface RunTeamModalProps {
    teamId: string
    teamName: string
    onClose: () => void
    onCreated: (runId: string) => void
}

/**
 * Slide-out panel for starting a team run.
 * User enters a task/prompt, then submits to create a pending team_run.
 */
export function RunTeamModal({ teamId, teamName, onClose, onCreated }: RunTeamModalProps) {
    const { workspaceId } = useWorkspace()
    const { user } = useAuth()
    const createMutation = useCreateTeamRun()

    const [inputTask, setInputTask] = useState('')
    const [error, setError] = useState('')
    const [files, setFiles] = useState<File[]>([])
    const [isUploading, setIsUploading] = useState(false)

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()

        const trimmed = inputTask.trim()
        if (!trimmed) {
            setError('Enter a task or prompt for the pipeline to process.')
            return
        }

        createMutation.mutate(
            {
                team_id: teamId,
                workspace_id: workspaceId ?? '',
                input_task: trimmed,
                created_by: user?.id ?? '',
            },
            {
                onSuccess: (run) => {
                    void (async () => {
                        // Upload attached files (non-blocking — run is created even if upload fails)
                        if (files.length > 0 && workspaceId) {
                            setIsUploading(true)
                            try {
                                await uploadAttachments({
                                    workspaceId,
                                    teamRunId: run.id,
                                    direction: 'input',
                                    files,
                                    userId: user?.id,
                                })
                            } catch (err) {
                                console.error('[RunTeam] File upload error:', err)
                            } finally {
                                setIsUploading(false)
                            }
                        }
                        onClose()
                        onCreated(run.id)
                    })()
                },
            },
        )
    }

    return (
        <SlidePanel
            open
            onClose={onClose}
            title="Run Team"
            footer={
                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:text-gray-200"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
                        disabled={createMutation.isPending}
                        className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                    >
                        {createMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Play className="h-4 w-4" />
                        )}
                        Run Pipeline
                    </button>
                </div>
            }
        >
            <p className="mb-5 text-sm text-gray-500">
                Start a pipeline run for <span className="font-medium text-gray-300">{teamName}</span>.
                Each step will execute in sequence.
            </p>

            <div className="space-y-4">
                <div>
                    <div className="mb-1.5 flex items-center gap-1.5">
                        <label htmlFor="input-task" className="text-sm font-medium text-gray-300">
                            Task / Prompt <span className="text-red-400">*</span>
                        </label>
                        <SpeechToTextButton
                            onTranscript={(text) => {
                                setInputTask((prev) => prev ? `${prev} ${text}` : text)
                                setError('')
                            }}
                        />
                    </div>
                    <textarea
                        id="input-task"
                        value={inputTask}
                        onChange={(e) => { setInputTask(e.target.value); setError('') }}
                        placeholder="Enter the task or prompt for the pipeline to process..."
                        rows={4}
                        className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-brand-primary resize-none"
                        autoFocus
                    />
                    {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
                </div>

                {/* File Attachments */}
                <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-300">
                        Attachments <span className="text-gray-600">(optional)</span>
                    </label>
                    <FileUploadZone
                        files={files}
                        onChange={setFiles}
                        disabled={createMutation.isPending || isUploading}
                    />
                </div>

                {createMutation.isError && (
                    <p className="text-xs text-red-400">
                        {createMutation.error.message || 'Failed to start run'}
                    </p>
                )}
            </div>
        </SlidePanel>
    )
}
