// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

export function safeInternalRedirect(value: string | null | undefined, fallback = '/'): string {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
    try {
        const parsed = new URL(value, window.location.origin)
        return parsed.origin === window.location.origin
            ? `${parsed.pathname}${parsed.search}${parsed.hash}`
            : fallback
    } catch {
        return fallback
    }
}
