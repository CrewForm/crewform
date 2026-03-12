// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAgents } from '@/hooks/useAgents'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useAuth } from '@/hooks/useAuth'
import { useCreateTask } from '@/hooks/useCreateTask'
import { taskSchema } from '@/lib/taskSchema'
import { cn } from '@/lib/utils'
import { SpeechToTextButton } from '@/components/shared/SpeechToTextButton'
import { FileUploadZone } from '@/components/shared/FileUploadZone'
import { SlidePanel } from '@/components/shared/SlidePanel'
import { uploadAttachments } from '@/db/attachments'
import type { TaskPriority } from '@/types'
import type { ZodError } from 'zod'

interface CreateTaskModalProps {
    onClose: () => void
    initialDate?: string
}

const PRIORITIES: { value: TaskPriority; label: string }[] = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' },
]

export function CreateTaskModal({ onClose, initialDate }: CreateTaskModalProps) {
    const { workspaceId } = useWorkspace()
    const { user } = useAuth()
    const { agents } = useAgents(workspaceId)
    const createMutation = useCreateTask()

    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [agentId, setAgentId] = useState('')
    const [priority, setPriority] = useState<TaskPriority>('medium')
    const [files, setFiles] = useState<File[]>([])
    const [isUploading, setIsUploading] = useState(false)
    const [scheduledFor, setScheduledFor] = useState(() => {
        if (initialDate) {
            // From calendar: use the selected date at 09:00 local time
            return `${initialDate}T09:00`
        }
        // From list: default to now
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
    })
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

    function handleSubmit(dispatch: boolean) {
        try {
            const validated = taskSchema.parse({
                title,
                description,
                assigned_agent_id: agentId,
                priority,
            })
            setFieldErrors({})

            if (!workspaceId || !user) return

            createMutation.mutate(
                {
                    workspace_id: workspaceId,
                    title: validated.title,
                    description: validated.description,
                    assigned_agent_id: validated.assigned_agent_id,
                    priority: validated.priority,
                    status: dispatch ? 'pending' : 'pending',
                    created_by: user.id,
                    scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null,
                },
                {
                    onSuccess: (created) => {
                        void (async () => {
                            // Upload attached files (non-blocking — task is created even if upload fails)
                            if (files.length > 0) {
                                setIsUploading(true)
                                try {
                                    await uploadAttachments({
                                        workspaceId,
                                        taskId: created.id,
                                        direction: 'input',
                                        files,
                                        userId: user.id,
                                    })
                                } catch (err) {
                                    console.error('[CreateTask] File upload error:', err)
                                } finally {
                                    setIsUploading(false)
                                }
                            }
                            onClose()
                        })()
                    },
                },
            )
        } catch (err) {
            const zodError = err as ZodError
            const errors: Record<string, string> = {}
            for (const issue of zodError.issues) {
                const field = issue.path[0]
                if (typeof field === 'string') errors[field] = issue.message
            }
            setFieldErrors(errors)
        }
    }

    return (
        <SlidePanel
            open
            onClose={onClose}
            title="Create Task"
            footer={
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => handleSubmit(false)}
                        disabled={createMutation.isPending}
                        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200 disabled:opacity-50"
                    >
                        Create &amp; Hold
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSubmit(true)}
                        disabled={createMutation.isPending}
                        className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
                    >
                        {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Create &amp; Dispatch
                    </button>
                </div>
            }
        >
            <div className="space-y-4">
                {/* Title */}
                <div>
                    <label htmlFor="task-title" className="mb-1.5 block text-sm font-medium text-gray-300">
                        Title <span className="text-red-400">*</span>
                    </label>
                    <input
                        id="task-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="What needs to be done?"
                        className="w-full rounded-lg border border-border bg-surface-primary px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                        autoFocus
                    />
                    {fieldErrors.title && <p className="mt-1 text-xs text-red-400">{fieldErrors.title}</p>}
                </div>

                {/* Description */}
                <div>
                    <div className="mb-1.5 flex items-center gap-1.5">
                        <label htmlFor="task-desc" className="text-sm font-medium text-gray-300">
                            Description
                        </label>
                        <SpeechToTextButton
                            onTranscript={(text) => {
                                setDescription((prev) => prev ? `${prev} ${text}` : text)
                            }}
                        />
                    </div>
                    <textarea
                        id="task-desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        placeholder="Provide details, context, and expectations..."
                        className="w-full rounded-lg border border-border bg-surface-primary px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                    />
                    {fieldErrors.description && <p className="mt-1 text-xs text-red-400">{fieldErrors.description}</p>}
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

                {/* Agent */}
                <div>
                    <label htmlFor="task-agent" className="mb-1.5 block text-sm font-medium text-gray-300">
                        Assign to Agent <span className="text-red-400">*</span>
                    </label>
                    <select
                        id="task-agent"
                        value={agentId}
                        onChange={(e) => setAgentId(e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface-primary px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-brand-primary"
                    >
                        <option value="">Select an agent...</option>
                        {agents.map((a) => (
                            <option key={a.id} value={a.id}>{a.name} — {a.model}</option>
                        ))}
                    </select>
                    {fieldErrors.assigned_agent_id && <p className="mt-1 text-xs text-red-400">{fieldErrors.assigned_agent_id}</p>}
                </div>

                {/* Priority */}
                <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-300">Priority</label>
                    <div className="flex gap-1 rounded-lg border border-border bg-surface-primary p-1">
                        {PRIORITIES.map(({ value, label }) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setPriority(value)}
                                className={cn(
                                    'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                                    priority === value
                                        ? 'bg-brand-primary text-black'
                                        : 'text-gray-500 hover:text-gray-300',
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Schedule Date & Time */}
                <div>
                    <label htmlFor="task-schedule" className="mb-1.5 block text-sm font-medium text-gray-300">
                        Schedule for
                    </label>
                    <input
                        id="task-schedule"
                        type="datetime-local"
                        value={scheduledFor}
                        onChange={(e) => setScheduledFor(e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface-primary px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-brand-primary [color-scheme:dark]"
                    />
                </div>

                {/* Error */}
                {createMutation.error && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
                        {createMutation.error.message}
                    </div>
                )}
            </div>
        </SlidePanel>
    )
}
