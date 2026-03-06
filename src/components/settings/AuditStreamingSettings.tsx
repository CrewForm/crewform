// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect } from 'react'
import {
    Radio, Loader2, CheckCircle2, XCircle,
    Send,
} from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import {
    useAuditStreamingConfig,
    useUpdateAuditStreamingConfig,
} from '@/hooks/useMembers'
import { testAuditWebhook } from '@/db/members'
import type { AuditStreamingConfig } from '@/db/members'

const SERVICE_PRESETS: {
    value: AuditStreamingConfig['service']
    label: string
    placeholder: string
    description: string
}[] = [
        {
            value: 'datadog',
            label: 'Datadog',
            placeholder: 'https://http-intake.logs.datadoghq.com/api/v2/logs',
            description: 'Send logs to Datadog HTTP Logs API',
        },
        {
            value: 'splunk',
            label: 'Splunk',
            placeholder: 'https://input-your-instance.splunkcloud.com:8088/services/collector/event',
            description: 'Send logs to Splunk HTTP Event Collector',
        },
        {
            value: 'custom',
            label: 'Custom Webhook',
            placeholder: 'https://your-endpoint.example.com/webhooks/audit',
            description: 'Send logs to any HTTP endpoint that accepts JSON POST',
        },
    ]

export function AuditStreamingSettings() {
    const { workspaceId } = useWorkspace()
    const { data: config, isLoading } = useAuditStreamingConfig(workspaceId)
    const updateMutation = useUpdateAuditStreamingConfig()

    const [enabled, setEnabled] = useState(false)
    const [service, setService] = useState<AuditStreamingConfig['service']>('custom')
    const [webhookUrl, setWebhookUrl] = useState('')
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
    const [testMessage, setTestMessage] = useState('')
    const [isDirty, setIsDirty] = useState(false)

    // Sync form state when config loads
    useEffect(() => {
        if (config) {
            setEnabled(config.enabled)
            setService(config.service)
            setWebhookUrl(config.webhookUrl)
        }
    }, [config])

    function handleSave() {
        if (!workspaceId) return
        updateMutation.mutate({ workspaceId, config: { enabled, service, webhookUrl } })
        setIsDirty(false)
    }

    async function handleTest() {
        if (!webhookUrl) return
        setTestStatus('testing')
        setTestMessage('')
        try {
            const result = await testAuditWebhook(webhookUrl)
            if (result.ok) {
                setTestStatus('success')
                setTestMessage(`Success (${result.status} ${result.statusText})`)
            } else {
                setTestStatus('error')
                setTestMessage(`Failed: ${result.status} ${result.statusText}`)
            }
        } catch {
            setTestStatus('error')
            setTestMessage('Network error — could not reach endpoint')
        }
        setTimeout(() => setTestStatus('idle'), 5000)
    }

    const preset = SERVICE_PRESETS.find((p) => p.value === service) ?? SERVICE_PRESETS[2]

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-medium text-gray-200">Audit Log Streaming</h3>
                    <p className="mt-1 text-sm text-gray-500">
                        Stream audit events to external services in real-time.
                    </p>
                </div>
                {/* Toggle */}
                <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => { setEnabled(!enabled); setIsDirty(true) }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${enabled ? 'bg-brand-primary' : 'bg-gray-700'
                        }`}
                >
                    <span
                        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                    />
                </button>
            </div>

            {enabled && (
                <>
                    {/* Service selector */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Service</label>
                        <div className="grid grid-cols-3 gap-2">
                            {SERVICE_PRESETS.map((p) => (
                                <button
                                    key={p.value}
                                    type="button"
                                    onClick={() => { setService(p.value); setIsDirty(true) }}
                                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all ${service === p.value
                                        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                                        : 'border-border bg-surface-raised text-gray-400 hover:border-border-hover hover:text-gray-300'
                                        }`}
                                >
                                    <Radio className="h-4 w-4" />
                                    <span className="text-xs font-medium">{p.label}</span>
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500">{preset.description}</p>
                    </div>

                    {/* Webhook URL */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Webhook URL</label>
                        <input
                            type="url"
                            value={webhookUrl}
                            onChange={(e) => { setWebhookUrl(e.target.value); setIsDirty(true) }}
                            placeholder={preset.placeholder}
                            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50"
                        />
                    </div>

                    {/* Test & Save buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void handleTest()}
                            disabled={!webhookUrl || testStatus === 'testing'}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200 disabled:opacity-50"
                        >
                            {testStatus === 'testing' ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : testStatus === 'success' ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                            ) : testStatus === 'error' ? (
                                <XCircle className="h-3.5 w-3.5 text-red-400" />
                            ) : (
                                <Send className="h-3.5 w-3.5" />
                            )}
                            Test Webhook
                        </button>

                        {testMessage && (
                            <span className={`text-xs ${testStatus === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                                {testMessage}
                            </span>
                        )}

                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={!isDirty || updateMutation.isPending}
                            className="ml-auto flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-1.5 text-xs font-medium text-black transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
                        >
                            {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Save
                        </button>
                    </div>

                    {/* Payload preview */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-500">Payload Format</label>
                        <pre className="overflow-x-auto rounded-lg bg-surface-raised p-3 text-xs text-gray-500">
                            {`{
  "source": "crewform",
  "event_type": "audit_log",
  "timestamp": "2026-03-03T08:00:00Z",
  "data": {
    "workspace_id": "...",
    "user_id": "...",
    "action": "agent_created",
    "details": { ... }
  }
}`}
                        </pre>
                    </div>
                </>
            )}
        </div>
    )
}
