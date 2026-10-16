// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { AlertCircle, RefreshCw } from 'lucide-react'

interface ErrorStateProps {
    title?: string
    message?: string
    onRetry?: () => void
}

export function ErrorState({
    title = 'Something went wrong',
    message = 'An unexpected error occurred. Please try again.',
    onRetry,
}: ErrorStateProps) {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-status-error/30 bg-status-error/5 py-12">
            <AlertCircle className="mb-3 h-10 w-10 text-status-error-text" />
            <p className="text-sm font-medium text-gray-200">{title}</p>
            <p className="mt-1 text-xs text-gray-400">{message}</p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="mt-4 inline-flex items-center gap-2 rounded-md bg-surface-secondary px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-surface-secondary/80"
                >
                    <RefreshCw className="h-4 w-4" />
                    Try again
                </button>
            )}
        </div>
    )
}
