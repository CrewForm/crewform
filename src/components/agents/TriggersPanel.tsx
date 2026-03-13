// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import {
    Clock, Globe, Zap, Plus, Trash2, Power, PowerOff,
    Loader2, ChevronDown, ChevronUp, Copy, CheckCircle2, XCircle,
} from 'lucide-react'
import { useTriggers, useCreateTrigger, useToggleTrigger, useDeleteTrigger, useTriggerLog } from '@/hooks/useTriggers'
import { useWorkspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/utils'
import { WebhookExample } from '@/components/triggers/WebhookExample'
import { getApiUrl } from '@/lib/apiUrl'
import type { AgentTrigger, TriggerType } from '@/db/triggers'

// ─── Constants ──────────────────────────────────────────────────────────────

const TRIGGER_TYPE_META: Record<TriggerType, { label: string; icon: typeof Clock; color: string }> = {
    cron: { label: 'Schedule (CRON)', icon: Clock, color: 'text-blue-400' },
    webhook: { label: 'Webhook', icon: Globe, color: 'text-green-400' },
    manual: { label: 'Manual', icon: Zap, color: 'text-yellow-400' },
}

const CRON_PRESETS = [
    { label: 'Every 5 minutes', value: '*/5 * * * *' },
    { label: 'Every 30 minutes', value: '*/30 * * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Daily at 9am', value: '0 9 * * *' },
    { label: 'Mon–Fri at 9am', value: '0 9 * * 1-5' },
    { label: 'Weekly (Mon 9am)', value: '0 9 * * 1' },
]

// ─── Main Component ─────────────────────────────────────────────────────────

export function TriggersPanel({ agentId }: { agentId: string }) {
    const { workspaceId } = useWorkspace()
    const { data: triggers, isLoading } = useTriggers(agentId)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-2xl space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                    Triggers run this agent automatically on a schedule, via webhooks, or manually.
                </p>
                <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-brand-hover"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add Trigger
                </button>
            </div>

            {/* Create form */}
            {showCreateForm && workspaceId && (
                <CreateTriggerForm
                    agentId={agentId}
                    workspaceId={workspaceId}
                    onClose={() => setShowCreateForm(false)}
                />
            )}

            {/* Trigger list */}
            {(!triggers || triggers.length === 0) && !showCreateForm && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-card py-16">
                    <Clock className="mb-4 h-10 w-10 text-gray-600" />
                    <h3 className="mb-1 text-lg font-medium text-gray-300">No triggers configured</h3>
                    <p className="text-sm text-gray-500">
                        Add a trigger to run this agent automatically.
                    </p>
                </div>
            )}

            {triggers && triggers.length > 0 && (
                <div className="space-y-2">
                    {triggers.map((trigger) => (
                        <TriggerCard
                            key={trigger.id}
                            trigger={trigger}
                            isExpanded={expandedLogId === trigger.id}
                            onToggleLog={() => setExpandedLogId(
                                expandedLogId === trigger.id ? null : trigger.id,
                            )}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

// ─── Create Form ────────────────────────────────────────────────────────────

function CreateTriggerForm({
    agentId,
    workspaceId,
    onClose,
}: {
    agentId: string
    workspaceId: string
    onClose: () => void
}) {
    const createMutation = useCreateTrigger()
    const [triggerType, setTriggerType] = useState<TriggerType>('cron')
    const [cronExpression, setCronExpression] = useState('0 9 * * *')
    const [taskTitle, setTaskTitle] = useState('')
    const [taskDescription, setTaskDescription] = useState('')

    function handleSubmit() {
        if (!taskTitle.trim()) return

        createMutation.mutate(
            {
                agent_id: agentId,
                workspace_id: workspaceId,
                trigger_type: triggerType,
                cron_expression: triggerType === 'cron' ? cronExpression : null,
                task_title_template: taskTitle,
                task_description_template: taskDescription,
            },
            { onSuccess: () => onClose() },
        )
    }

    return (
        <div className="rounded-lg border border-border bg-surface-card p-4 space-y-4">
            <h4 className="text-sm font-medium text-gray-200">New Trigger</h4>

            {/* Type selector */}
            <div className="flex gap-1 rounded-lg border border-border bg-surface-primary p-1">
                {(Object.entries(TRIGGER_TYPE_META) as [TriggerType, typeof TRIGGER_TYPE_META.cron][]).map(([type, meta]) => (
                    <button
                        key={type}
                        type="button"
                        onClick={() => setTriggerType(type)}
                        className={cn(
                            'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                            triggerType === type
                                ? 'bg-brand-primary text-black'
                                : 'text-gray-500 hover:text-gray-300',
                        )}
                    >
                        <meta.icon className="h-3.5 w-3.5" />
                        {meta.label}
                    </button>
                ))}
            </div>

            {/* CRON config */}
            {triggerType === 'cron' && (
                <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">CRON Expression</label>
                    <input
                        type="text"
                        value={cronExpression}
                        onChange={(e) => setCronExpression(e.target.value)}
                        placeholder="* * * * *"
                        className="mb-2 w-full rounded-lg border border-border bg-surface-primary px-3 py-2 font-mono text-sm text-gray-200 outline-none focus:border-brand-primary"
                    />
                    <div className="flex flex-wrap gap-1">
                        {CRON_PRESETS.map((preset) => (
                            <button
                                key={preset.value}
                                type="button"
                                onClick={() => setCronExpression(preset.value)}
                                className={cn(
                                    'rounded-md border px-2 py-1 text-[10px] font-medium transition-colors',
                                    cronExpression === preset.value
                                        ? 'border-brand-primary/50 bg-brand-primary/10 text-brand-primary'
                                        : 'border-border text-gray-500 hover:text-gray-300',
                                )}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Webhook info */}
            {triggerType === 'webhook' && (
                <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs text-gray-400">
                    A unique webhook URL will be generated after creation. External systems can POST to it to fire this agent.
                </div>
            )}

            {/* Task title template */}
            <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">
                    Task Title <span className="text-red-400">*</span>
                </label>
                <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="e.g. Daily report for {{date}}"
                    className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-primary"
                />
                <p className="mt-1 text-[10px] text-gray-600">
                    Use {'{{date}}'}, {'{{time}}'}, {'{{datetime}}'} for dynamic values
                </p>
            </div>

            {/* Task description template */}
            <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Task Description</label>
                <textarea
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    rows={2}
                    placeholder="Optional description for auto-created tasks..."
                    className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-primary"
                />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-elevated"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!taskTitle.trim() || createMutation.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
                >
                    {createMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Create Trigger
                </button>
            </div>
        </div>
    )
}

// ─── Trigger Card ───────────────────────────────────────────────────────────

function TriggerCard({
    trigger,
    isExpanded,
    onToggleLog,
}: {
    trigger: AgentTrigger
    isExpanded: boolean
    onToggleLog: () => void
}) {
    const toggleMutation = useToggleTrigger()
    const deleteMutation = useDeleteTrigger()
    const [copied, setCopied] = useState(false)

    const meta = TRIGGER_TYPE_META[trigger.trigger_type]
    const Icon = meta.icon

    function handleToggle() {
        toggleMutation.mutate({
            id: trigger.id,
            enabled: !trigger.enabled,
            agentId: trigger.agent_id ?? undefined,
            teamId: trigger.team_id ?? undefined,
        })
    }

    function handleDelete() {
        if (!confirm('Delete this trigger? This cannot be undone.')) return
        deleteMutation.mutate({ id: trigger.id, agentId: trigger.agent_id ?? undefined, teamId: trigger.team_id ?? undefined })
    }

    function copyWebhookUrl() {
        if (!trigger.webhook_token) return
        const url = `${getApiUrl()}/functions/v1/webhook-trigger?token=${trigger.webhook_token}`
        void navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="rounded-lg border border-border bg-surface-card">
            <div className="flex items-center gap-3 px-4 py-3">
                {/* Icon */}
                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-raised', meta.color)}>
                    <Icon className="h-4 w-4" />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-200">{trigger.task_title_template}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className={meta.color}>{meta.label}</span>
                        {trigger.cron_expression && (
                            <code className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-gray-400">
                                {trigger.cron_expression}
                            </code>
                        )}
                        {trigger.last_fired_at && (
                            <span>Last: {new Date(trigger.last_fired_at).toLocaleString()}</span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                    {/* Webhook copy */}
                    {trigger.trigger_type === 'webhook' && trigger.webhook_token && (
                        <button
                            type="button"
                            onClick={copyWebhookUrl}
                            title="Copy webhook URL"
                            className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-surface-raised hover:text-gray-300"
                        >
                            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                    )}

                    {/* Toggle */}
                    <button
                        type="button"
                        onClick={handleToggle}
                        disabled={toggleMutation.isPending}
                        title={trigger.enabled ? 'Disable' : 'Enable'}
                        className={cn(
                            'rounded-md p-1.5 transition-colors',
                            trigger.enabled
                                ? 'text-green-400 hover:bg-green-500/10'
                                : 'text-gray-600 hover:bg-surface-raised hover:text-gray-400',
                        )}
                    >
                        {trigger.enabled ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                    </button>

                    {/* Log toggle */}
                    <button
                        type="button"
                        onClick={onToggleLog}
                        title="View log"
                        className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-surface-raised hover:text-gray-300"
                    >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>

                    {/* Delete */}
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleteMutation.isPending}
                        title="Delete"
                        className="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {/* Webhook POST example */}
            {trigger.trigger_type === 'webhook' && trigger.webhook_token && (
                <WebhookExample
                    webhookToken={trigger.webhook_token}
                    inputField="task_input"
                    inputExample="Write a summary of today's meeting notes"
                />
            )}

            {/* Trigger log */}
            {isExpanded && <TriggerLogPanel triggerId={trigger.id} />}
        </div>
    )
}

// ─── Trigger Log ────────────────────────────────────────────────────────────

function TriggerLogPanel({ triggerId }: { triggerId: string }) {
    const { data: logs, isLoading } = useTriggerLog(triggerId)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center border-t border-border py-4">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            </div>
        )
    }

    if (!logs || logs.length === 0) {
        return (
            <div className="border-t border-border px-4 py-3 text-center text-xs text-gray-500">
                No firings yet
            </div>
        )
    }

    return (
        <div className="border-t border-border">
            <div className="max-h-48 overflow-y-auto divide-y divide-border/50">
                {logs.map((log) => (
                    <div key={log.id} className="flex items-center gap-2 px-4 py-2">
                        {log.status === 'fired' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-400" />
                        ) : (
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                        )}
                        <span className="text-xs text-gray-400">
                            {new Date(log.fired_at).toLocaleString()}
                        </span>
                        {log.task_id && (
                            <code className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-gray-500">
                                {log.task_id.substring(0, 8)}
                            </code>
                        )}
                        {log.error && (
                            <span className="truncate text-xs text-red-400">{log.error}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
