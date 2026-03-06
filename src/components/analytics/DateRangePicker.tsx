// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { cn } from '@/lib/utils'

export interface DateRange {
    label: string
    startDate: string
    endDate: string
}

function daysAgo(n: number): string {
    const d = new Date()
    d.setDate(d.getDate() - n)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
}

function startOfMonth(): string {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
}

const today = () => new Date().toISOString()

export const DATE_PRESETS: DateRange[] = [
    { label: 'Last 7 days', startDate: daysAgo(7), endDate: today() },
    { label: 'Last 30 days', startDate: daysAgo(30), endDate: today() },
    { label: 'Last 90 days', startDate: daysAgo(90), endDate: today() },
    { label: 'This month', startDate: startOfMonth(), endDate: today() },
]

interface DateRangePickerProps {
    activeLabel: string
    onChange: (range: DateRange) => void
}

/**
 * Date range preset picker — horizontal button group.
 */
export function DateRangePicker({ activeLabel, onChange }: DateRangePickerProps) {
    return (
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-card p-1">
            {DATE_PRESETS.map((preset) => (
                <button
                    key={preset.label}
                    type="button"
                    onClick={() => onChange(preset)}
                    className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                        activeLabel === preset.label
                            ? 'bg-brand-primary text-black shadow-sm'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-surface-elevated',
                    )}
                >
                    {preset.label}
                </button>
            ))}
        </div>
    )
}
