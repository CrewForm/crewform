// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { X } from 'lucide-react'

interface SlidePanelProps {
    open: boolean
    onClose: () => void
    title?: string
    children: React.ReactNode
    /** Footer slot — rendered at the bottom of the panel */
    footer?: React.ReactNode
}

/**
 * Reusable slide-out panel from the right edge.
 * Matches the existing TaskDetailPanel pattern.
 */
export function SlidePanel({ open, onClose, title, children, footer }: SlidePanelProps) {
    if (!open) return null

    return (
        <div className="fixed inset-0 z-40 flex justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Panel */}
            <div className="relative w-full max-w-xl flex flex-col border-l border-border bg-surface-primary shadow-xl">
                {/* Close button */}
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-surface-elevated hover:text-gray-300"
                    aria-label="Close"
                >
                    <X className="h-5 w-5" />
                </button>

                {/* Header */}
                {title && (
                    <div className="shrink-0 border-b border-border px-6 py-4 pr-12">
                        <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
                    </div>
                )}

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {children}
                </div>

                {/* Optional sticky footer */}
                {footer && (
                    <div className="shrink-0 border-t border-border p-6">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    )
}
