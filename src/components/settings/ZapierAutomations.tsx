// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { createElement, useEffect, useRef, useState } from 'react'
import { ExternalLink, Zap, Loader2 } from 'lucide-react'

// ─── Zapier Workflow Element ────────────────────────────────────────────────
// Embeds Zapier's Workflow Element so users can discover, create, and manage
// Zaps directly inside CrewForm.
//
// Requires a Zapier Client ID from the Developer Platform → Embed settings.
// Set it via VITE_ZAPIER_CLIENT_ID in your .env file.
// ────────────────────────────────────────────────────────────────────────────

const ZAPIER_CLIENT_ID = import.meta.env.VITE_ZAPIER_CLIENT_ID as string | undefined

const ZAPIER_SCRIPT_URL =
    'https://cdn.zapier.com/packages/partner-sdk/v0/zapier-elements/zapier-elements.esm.js'
const ZAPIER_CSS_URL =
    'https://cdn.zapier.com/packages/partner-sdk/v0/zapier-elements/zapier-elements.css'

function useZapierSDK() {
    const [loaded, setLoaded] = useState(false)
    const attempted = useRef(false)

    useEffect(() => {
        if (attempted.current) return
        attempted.current = true

        // Load CSS
        if (!document.querySelector(`link[href="${ZAPIER_CSS_URL}"]`)) {
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = ZAPIER_CSS_URL
            document.head.appendChild(link)
        }

        // Load JS
        if (!document.querySelector(`script[src="${ZAPIER_SCRIPT_URL}"]`)) {
            const script = document.createElement('script')
            script.type = 'module'
            script.src = ZAPIER_SCRIPT_URL
            script.onload = () => setLoaded(true)
            document.head.appendChild(script)
        } else {
            setLoaded(true)
        }
    }, [])

    return loaded
}

export function ZapierAutomations() {
    const sdkLoaded = useZapierSDK()

    if (!ZAPIER_CLIENT_ID) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-lg font-semibold text-gray-100">Automations</h2>
                    <p className="mt-1 text-sm text-gray-400">
                        Connect CrewForm to 7,000+ apps with Zapier.
                    </p>
                </div>

                <div className="rounded-xl border border-border bg-surface-card p-8 text-center">
                    <Zap className="mx-auto h-10 w-10 text-amber-400 mb-4" />
                    <h3 className="text-base font-semibold text-gray-200 mb-2">
                        Zapier Integration Not Configured
                    </h3>
                    <p className="text-sm text-gray-400 max-w-md mx-auto mb-6">
                        To enable the Zapier automation hub, add your Zapier Client ID to the environment configuration.
                    </p>
                    <div className="rounded-lg border border-border bg-surface-raised px-4 py-3 text-left max-w-sm mx-auto">
                        <p className="text-xs text-gray-500 mb-1">Add to your <code className="text-gray-400">.env</code> file:</p>
                        <code className="text-sm text-amber-400">VITE_ZAPIER_CLIENT_ID=your_client_id</code>
                    </div>
                    <div className="mt-6">
                        <a
                            href="https://developer.zapier.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-brand-primary hover:underline"
                        >
                            Get your Client ID from the Zapier Developer Platform
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-gray-100">Automations</h2>
                <p className="mt-1 text-sm text-gray-400">
                    Connect CrewForm to 7,000+ apps with Zapier. Create, manage, and monitor your automated workflows.
                </p>
            </div>

            {/* Loading indicator while Zapier SDK loads */}
            {!sdkLoaded && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                </div>
            )}

            {/* Zapier Workflow Element */}
            <div
                className="rounded-xl border border-border bg-surface-card overflow-hidden"
                style={{ minHeight: sdkLoaded ? '500px' : undefined }}
            >
                {sdkLoaded && (
                    <div>{createElement('zapier-workflow-element', {
                        'client-id': ZAPIER_CLIENT_ID,
                        theme: 'dark',
                        'intro-copy-display': 'show',
                        'manage-zaps-display': 'show',
                    })}</div>
                )}
            </div>

            {/* Help link */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface-raised px-4 py-3">
                <p className="text-sm text-gray-400">
                    Need help setting up automations?
                </p>
                <a
                    href="https://developer.zapier.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-brand-primary hover:underline"
                >
                    Zapier Integration Docs
                    <ExternalLink className="h-3.5 w-3.5" />
                </a>
            </div>
        </div>
    )
}
