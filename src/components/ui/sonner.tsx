// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Toaster as SonnerToaster } from 'sonner'

export function Toaster() {
    return (
        <SonnerToaster
            position="top-right"
            toastOptions={{
                style: {
                    background: '#141828',
                    border: '1px solid #2E3450',
                    color: '#FFFFFF',
                    fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
                },
                classNames: {
                    success: 'border-green-500/30',
                    error: 'border-red-500/30',
                    warning: 'border-yellow-500/30',
                    info: 'border-blue-500/30',
                },
            }}
            richColors
            closeButton
        />
    )
}
