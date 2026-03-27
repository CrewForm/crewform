// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * React Error Boundary for the workflow canvas.
 * On crash: switches to Form view and shows a toast.
 */

import { Component, type ReactNode } from 'react'

interface Props {
    children: ReactNode
    onError: (error: Error) => void
}

interface State {
    hasError: boolean
    error: Error | null
}

export class CanvasErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error) {
        console.error('[CanvasErrorBoundary] Canvas crashed:', error)
        this.props.onError(error)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5 p-8" style={{ height: 560 }}>
                    <p className="mb-2 text-sm font-medium text-red-400">
                        Canvas encountered an error
                    </p>
                    <p className="mb-4 text-xs text-gray-500">
                        Switched to Form view. Your configuration is safe.
                    </p>
                    <button
                        type="button"
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-gray-400 transition-colors hover:border-brand-primary hover:text-brand-primary"
                    >
                        Try Canvas Again
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}
