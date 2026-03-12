// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Link } from 'react-router-dom'
import { ArrowLeft, Ghost } from 'lucide-react'

export function NotFound() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-surface-base px-4 text-center">
            <Ghost className="mb-6 h-16 w-16 text-gray-600" />
            <h1 className="mb-2 text-4xl font-bold text-gray-100">404</h1>
            <p className="mb-6 text-lg text-gray-400">
                This page doesn&apos;t exist or has been moved.
            </p>
            <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-hover"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
            </Link>
        </div>
    )
}
