// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Copy, Check, ChevronDown, ChevronUp, Code } from 'lucide-react'
import { getApiUrl } from '@/lib/apiUrl'
import { cn } from '@/lib/utils'

interface WebhookExampleProps {
    webhookToken: string
    /** The JSON field name for the task input (e.g. "input_task" for teams, "task_input" for agents) */
    inputField: string
    /** Example input value to show in the cURL command */
    inputExample: string
}

/**
 * Displays the webhook URL and a collapsible cURL POST example.
 * Reused by both agent TriggersPanel and team TeamTriggersPanel.
 */
export function WebhookExample({ webhookToken, inputField, inputExample }: WebhookExampleProps) {
    const [showExample, setShowExample] = useState(false)
    const [copiedUrl, setCopiedUrl] = useState(false)
    const [copiedCurl, setCopiedCurl] = useState(false)

    const webhookUrl = `${getApiUrl()}/functions/v1/webhook-trigger?token=${webhookToken}`

    const curlExample = `curl -X POST '${webhookUrl}' \\
  -H 'Content-Type: application/json' \\
  -d '{"${inputField}": "${inputExample}"}'`

    function copyUrl() {
        void navigator.clipboard.writeText(webhookUrl)
        setCopiedUrl(true)
        setTimeout(() => setCopiedUrl(false), 2000)
    }

    function copyCurl() {
        void navigator.clipboard.writeText(curlExample)
        setCopiedCurl(true)
        setTimeout(() => setCopiedCurl(false), 2000)
    }

    return (
        <div className="border-t border-border">
            {/* Webhook URL row */}
            <div className="flex items-center gap-2 px-4 py-2">
                <code className="flex-1 truncate rounded bg-surface-raised px-2 py-1 text-xs text-gray-400">
                    POST {webhookUrl}
                </code>
                <button
                    type="button"
                    onClick={copyUrl}
                    title="Copy URL"
                    className="shrink-0 rounded p-1 text-gray-500 hover:bg-surface-raised hover:text-gray-300"
                >
                    {copiedUrl ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button
                    type="button"
                    onClick={() => setShowExample(!showExample)}
                    title={showExample ? 'Hide example' : 'Show POST example'}
                    className={cn(
                        'shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                        showExample
                            ? 'bg-brand-primary/10 text-brand-primary'
                            : 'text-gray-500 hover:bg-surface-raised hover:text-gray-300',
                    )}
                >
                    <Code className="h-3 w-3" />
                    Example
                    {showExample ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
            </div>

            {/* cURL example */}
            {showExample && (
                <div className="border-t border-border/50 px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                            cURL Example
                        </span>
                        <button
                            type="button"
                            onClick={copyCurl}
                            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-surface-raised hover:text-gray-300"
                        >
                            {copiedCurl ? (
                                <>
                                    <Check className="h-3 w-3 text-green-400" />
                                    Copied!
                                </>
                            ) : (
                                <>
                                    <Copy className="h-3 w-3" />
                                    Copy
                                </>
                            )}
                        </button>
                    </div>
                    <pre className="rounded-lg bg-surface-raised p-3 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                        {curlExample}
                    </pre>
                    <p className="text-[10px] text-gray-600">
                        Send a POST request with a JSON body. The <code className="text-gray-500">{inputField}</code> field will be used as the input for the run.
                    </p>
                </div>
            )}
        </div>
    )
}
