// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Extract displayable text from a task result.
 * Result can be { output: "..." }, a plain string, or any JSON object.
 */
export function extractResultText(result: unknown): string {
    if (typeof result === 'string') return result
    if (result !== null && result !== undefined && typeof result === 'object') {
        const obj = result as Record<string, unknown>
        if (typeof obj.output === 'string') return obj.output
        if (typeof obj.result === 'string') return obj.result
        return JSON.stringify(result, null, 2)
    }
    return ''
}
