// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

/**
 * Convert a 5-field cron expression to a human-readable description.
 *
 * Handles the most common patterns — not a full RFC parser, but covers
 * the expressions users will actually enter via the UI presets.
 *
 * Format: minute hour day-of-month month day-of-week
 */
export function cronToHuman(cron: string): string {
    const parts = cron.trim().split(/\s+/)
    if (parts.length !== 5) return cron

    const [minute, hour, dom, month, dow] = parts

    // ─── Step intervals ─────────────────────────────────────────────────
    // */N * * * *
    if (minute.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
        const n = parseInt(minute.slice(2), 10)
        if (n === 1) return 'Every minute'
        return `Every ${String(n)} minutes`
    }

    // 0 */N * * *
    if (minute === '0' && hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*') {
        const n = parseInt(hour.slice(2), 10)
        if (n === 1) return 'Every hour'
        return `Every ${String(n)} hours`
    }

    // ─── Specific times ─────────────────────────────────────────────────

    const formatTime = (h: string, m: string): string => {
        const hr = parseInt(h, 10)
        const mn = parseInt(m, 10)
        if (isNaN(hr) || isNaN(mn)) return `${h}:${m}`
        const ampm = hr >= 12 ? 'PM' : 'AM'
        const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr
        return mn === 0 ? `${String(hr12)}${ampm}` : `${String(hr12)}:${String(mn).padStart(2, '0')}${ampm}`
    }

    const DAY_NAMES: Record<string, string> = {
        '0': 'Sunday', '1': 'Monday', '2': 'Tuesday', '3': 'Wednesday',
        '4': 'Thursday', '5': 'Friday', '6': 'Saturday', '7': 'Sunday',
    }

    const MONTH_NAMES: Record<string, string> = {
        '1': 'January', '2': 'February', '3': 'March', '4': 'April',
        '5': 'May', '6': 'June', '7': 'July', '8': 'August',
        '9': 'September', '10': 'October', '11': 'November', '12': 'December',
    }

    const time = formatTime(hour, minute)

    // Daily: 0 9 * * *
    if (dom === '*' && month === '*' && dow === '*') {
        return `Daily at ${time}`
    }

    // Specific day-of-week: 0 9 * * 1
    if (dom === '*' && month === '*' && dow !== '*') {
        // Range: 1-5
        if (dow.includes('-')) {
            const [start, end] = dow.split('-')
            const startName = DAY_NAMES[start] ?? start
            const endName = DAY_NAMES[end] ?? end
            return `${startName}–${endName} at ${time}`
        }
        // List: 1,3,5
        if (dow.includes(',')) {
            const days = dow.split(',').map(d => DAY_NAMES[d] ?? d)
            return `${days.join(', ')} at ${time}`
        }
        // Single day
        const dayName = DAY_NAMES[dow] ?? `day ${dow}`
        return `Every ${dayName} at ${time}`
    }

    // Specific day-of-month: 0 9 15 * *
    if (dom !== '*' && month === '*' && dow === '*') {
        const ordinal = getOrdinal(parseInt(dom, 10))
        return `${ordinal} of every month at ${time}`
    }

    // Specific month and day: 0 9 25 12 *
    if (dom !== '*' && month !== '*' && dow === '*') {
        const monthName = MONTH_NAMES[month] ?? `month ${month}`
        const ordinal = getOrdinal(parseInt(dom, 10))
        return `${monthName} ${ordinal} at ${time}`
    }

    // Fallback: return a structured breakdown
    return cron
}

function getOrdinal(n: number): string {
    if (isNaN(n)) return String(n)
    const v = n % 100
    let suffix = 'th'
    if (v >= 11 && v <= 13) {
        suffix = 'th'
    } else {
        const lastDigit = v % 10
        if (lastDigit === 1) suffix = 'st'
        else if (lastDigit === 2) suffix = 'nd'
        else if (lastDigit === 3) suffix = 'rd'
    }
    return `${String(n)}${suffix}`
}
