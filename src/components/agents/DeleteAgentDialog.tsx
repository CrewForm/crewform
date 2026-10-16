// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { AlertTriangle } from 'lucide-react'

interface DeleteAgentDialogProps {
    agentName: string
    isDeleting: boolean
    onConfirm: () => void
    onCancel: () => void
}

/**
 * Confirmation dialog for deleting an agent.
 * Rendered as a modal overlay.
 */
export function DeleteAgentDialog({
    agentName,
    isDeleting,
    onConfirm,
    onCancel,
}: DeleteAgentDialogProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60"
                onClick={onCancel}
                aria-hidden="true"
            />

            {/* Dialog */}
            <div className="relative mx-4 w-full max-w-md rounded-lg border border-border bg-surface-card p-6 shadow-xl">
                <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-100">Delete Agent</h3>
                </div>

                <p className="mb-6 text-sm text-gray-400">
                    Are you sure you want to delete <strong className="text-gray-200">{agentName}</strong>?
                    This action cannot be undone. All task history for this agent will be preserved.
                </p>

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isDeleting}
                        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isDeleting}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    )
}
