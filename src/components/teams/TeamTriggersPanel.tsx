// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Plus, Clock, Globe, Zap, Copy, Check, Trash2, Power, PowerOff, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useTeamTriggers, useCreateTeamTrigger, useToggleTrigger, useDeleteTrigger, useTriggerLog } from '@/hooks/useTriggers'
import type { AgentTrigger, TriggerType } from '@/db/triggers'
import { cn } from '@/lib/utils'
import { WebhookExample } from '@/components/triggers/WebhookExample'
import { getApiUrl } from '@/lib/apiUrl'

const TRIGGER_TYPE_META: Record<TriggerType, { label: string; icon: typeof Clock; color: string }> = {
    cron: { label: 'Schedule', icon: Clock, color: 'text-blue-400' },
    webhook: { label: 'Webhook', icon: Globe, color: 'text-amber-400' },
    manual: { label: 'Manual', icon: Zap, color: 'text-green-400' },
}

/**
 * Team triggers panel — allows creating webhook/cron/manual triggers for a team.
 * External sources POST to the webhook URL and a team_run is created automatically.
 */
export function TeamTriggersPanel({ teamId }: { teamId: string }) {
    const { workspaceId } = useWorkspace()
    const { data: triggers, isLoading } = useTeamTriggers(teamId)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-200">Triggers</h2>
                    <p className="text-xs text-gray-500">Trigger this team automatically from external sources, schedules, or manually.</p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-brand-hover"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add Trigger
                </button>
            </div>

            {showCreateForm && workspaceId && (
                <CreateTeamTriggerForm
                    teamId={teamId}
                    workspaceId={workspaceId}
                    onClose={() => setShowCreateForm(false)}
                />
            )}

            {(!triggers || triggers.length === 0) && !showCreateForm && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8">
                    <Globe className="mb-2 h-6 w-6 text-gray-600" />
                    <p className="text-sm text-gray-500">No triggers configured</p>
                    <p className="text-xs text-gray-600 mt-1">Add a webhook trigger to run this team from external sources.</p>
                </div>
            )}

            {triggers && triggers.length > 0 && (
                <div className="space-y-2">
                    {triggers.map((trigger) => (
                        <TeamTriggerCard
                            key={trigger.id}
                            trigger={trigger}
                            teamId={teamId}
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

function CreateTeamTriggerForm({
    teamId,
    workspaceId,
    onClose,
}: {
    teamId: string
    workspaceId: string
    onClose: () => void
}) {
    const createMutation = useCreateTeamTrigger()
    const [triggerType, setTriggerType] = useState<TriggerType>('webhook')
    const [cronExpression, setCronExpression] = useState('0 9 * * *')
    const [titleTemplate, setTitleTemplate] = useState('Team run triggered on {{date}}')
    const [descTemplate, setDescTemplate] = useState('')

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        createMutation.mutate(
            {
                team_id: teamId,
                workspace_id: workspaceId,
                trigger_type: triggerType,
                cron_expression: triggerType === 'cron' ? cronExpression : null,
                task_title_template: titleTemplate,
                task_description_template: descTemplate,
            },
            { onSuccess: () => onClose() },
        )
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-border bg-surface-card p-4 space-y-4"
        >
            <h4 className="text-sm font-medium text-gray-200">New Trigger</h4>

            {/* Type selector */}
            <div className="flex gap-2">
                {(Object.entries(TRIGGER_TYPE_META) as [TriggerType, typeof TRIGGER_TYPE_META.cron][]).map(([type, meta]) => (
                    <button
                        key={type}
                        type="button"
                        onClick={() => setTriggerType(type)}
                        className={cn(
                            'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                            triggerType === type
                                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                                : 'border-border bg-surface-raised text-gray-500 hover:text-gray-300',
                        )}
                    >
                        <meta.icon className="h-3.5 w-3.5" />
                        {meta.label}
                    </button>
                ))}
            </div>

            {/* Cron expression */}
            {triggerType === 'cron' && (
                <div>
                    <label className="mb-1 block text-xs font-medium text-gray-400">Cron Expression</label>
                    <input
                        type="text"
                        value={cronExpression}
                        onChange={(e) => setCronExpression(e.target.value)}
                        placeholder="0 9 * * *"
                        className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-gray-200 focus:border-brand-primary focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-gray-600">e.g. &quot;0 9 * * *&quot; = daily at 9am</p>
                </div>
            )}

            {triggerType === 'webhook' && (
                <p className="text-xs text-gray-500">
                    A unique webhook URL will be generated. POST to it from any external source (Zapier, Make, n8n, GitHub Actions, etc.) to trigger this team.
                </p>
            )}

            {/* Title template */}
            <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">Input Title Template</label>
                <input
                    type="text"
                    value={titleTemplate}
                    onChange={(e) => setTitleTemplate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-gray-200 focus:border-brand-primary focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-600">
                    Available placeholders: {'{{date}}'} {'{{time}}'} {'{{datetime}}'}
                </p>
            </div>

            {/* Description template */}
            <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">Input Description (optional)</label>
                <textarea
                    value={descTemplate}
                    onChange={(e) => setDescTemplate(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-gray-200 focus:border-brand-primary focus:outline-none resize-none"
                />
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={createMutation.isPending || !titleTemplate.trim()}
                    className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black hover:bg-brand-hover disabled:opacity-50"
                >
                    {createMutation.isPending ? 'Creating…' : 'Create Trigger'}
                </button>
            </div>
        </form>
    )
}

// ─── Trigger Card ───────────────────────────────────────────────────────────

function TeamTriggerCard({
    trigger,
    teamId,
    isExpanded,
    onToggleLog,
}: {
    trigger: AgentTrigger
    teamId: string
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
            teamId,
        })
    }

    function handleDelete() {
        if (!confirm('Delete this trigger? This cannot be undone.')) return
        deleteMutation.mutate({ id: trigger.id, teamId })
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
            <div className="flex items-center gap-4 p-4">
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg bg-surface-raised')}>
                    <Icon className={cn('h-4 w-4', meta.color)} />
                </div>

                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-200">{trigger.task_title_template}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                        <span className={cn(
                            'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                            trigger.enabled ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500',
                        )}>
                            {trigger.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        {trigger.cron_expression && (
                            <span className="font-mono">{trigger.cron_expression}</span>
                        )}
                        {trigger.last_fired_at && (
                            <span>Last: {new Date(trigger.last_fired_at).toLocaleString()}</span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    {trigger.webhook_token && (
                        <button
                            type="button"
                            onClick={copyWebhookUrl}
                            title="Copy webhook URL"
                            className="rounded-lg p-2 text-gray-500 hover:bg-surface-raised hover:text-gray-300"
                        >
                            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onToggleLog}
                        title="View log"
                        className="rounded-lg p-2 text-gray-500 hover:bg-surface-raised hover:text-gray-300"
                    >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <button
                        type="button"
                        onClick={handleToggle}
                        title={trigger.enabled ? 'Disable' : 'Enable'}
                        className="rounded-lg p-2 text-gray-500 hover:bg-surface-raised hover:text-gray-300"
                    >
                        {trigger.enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </button>
                    <button
                        type="button"
                        onClick={handleDelete}
                        title="Delete"
                        className="rounded-lg p-2 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Webhook URL display + POST example */}
            {trigger.webhook_token && (
                <WebhookExample
                    webhookToken={trigger.webhook_token}
                    inputField="input_task"
                    inputExample="Summarize the latest quarterly report"
                />
            )}

            {/* Log panel */}
            {isExpanded && <TriggerLogPanel triggerId={trigger.id} />}
        </div>
    )
}

// ─── Trigger Log ────────────────────────────────────────────────────────────

function TriggerLogPanel({ triggerId }: { triggerId: string }) {
    const { data: logs, isLoading } = useTriggerLog(triggerId)

    if (isLoading) {
        return (
            <div className="border-t border-border p-4">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            </div>
        )
    }

    if (!logs || logs.length === 0) {
        return (
            <div className="border-t border-border p-4 text-center text-xs text-gray-600">
                No trigger events logged yet.
            </div>
        )
    }

    return (
        <div className="border-t border-border p-4">
            <table className="w-full text-xs">
                <thead>
                    <tr className="text-gray-500">
                        <th className="pb-2 text-left font-medium">Time</th>
                        <th className="pb-2 text-left font-medium">Status</th>
                        <th className="pb-2 text-left font-medium">Error</th>
                    </tr>
                </thead>
                <tbody>
                    {logs.map((log) => (
                        <tr key={log.id} className="border-t border-border/50">
                            <td className="py-1.5 text-gray-400">{new Date(log.fired_at).toLocaleString()}</td>
                            <td className="py-1.5">
                                <span className={cn(
                                    'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                    log.status === 'fired' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400',
                                )}>
                                    {log.status}
                                </span>
                            </td>
                            <td className="py-1.5 text-gray-500 truncate max-w-[200px]">{log.error ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
