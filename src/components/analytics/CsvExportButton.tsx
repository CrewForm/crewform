// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { fetchTasksForExport } from '@/db/analytics'
import type { TaskExportRow } from '@/db/analytics'

interface CsvExportButtonProps {
    workspaceId: string | null
    startDate: string
    endDate: string
}

function toCsv(rows: TaskExportRow[]): string {
    const headers = ['Type', 'Date', 'Task', 'Agent', 'Team', 'Status', 'Model', 'Tokens', 'Cost (USD)', 'Duration (s)']
    const lines = [headers.join(',')]

    for (const row of rows) {
        lines.push([
            row.type,
            row.date,
            `"${row.task_title.replace(/"/g, '""')}"`,
            `"${row.agent_name.replace(/"/g, '""')}"`,
            `"${row.team_name.replace(/"/g, '""')}"`,
            row.status,
            row.model,
            row.tokens.toString(),
            row.cost_usd.toFixed(6),
            row.duration_seconds.toString(),
        ].join(','))
    }

    return lines.join('\n')
}

/**
 * Button that downloads analytics data as CSV.
 */
export function CsvExportButton({ workspaceId, startDate, endDate }: CsvExportButtonProps) {
    const [isExporting, setIsExporting] = useState(false)

    async function handleExport() {
        if (!workspaceId || isExporting) return

        setIsExporting(true)
        try {
            const rows = await fetchTasksForExport(workspaceId, startDate, endDate)
            const csv = toCsv(rows)
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `crewform-analytics-${startDate}-to-${endDate}.csv`
            link.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error('CSV export failed:', err)
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting || !workspaceId}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200 disabled:opacity-50"
        >
            {isExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
                <Download className="h-3.5 w-3.5" />
            )}
            Export CSV
        </button>
    )
}
