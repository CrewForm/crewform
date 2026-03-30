// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Square } from 'lucide-react'

function EndNodeComponent() {
    return (
        <div className="workflow-end-node workflow-glass-node flex items-center gap-2 rounded-xl border-2 border-red-500/50 px-4 py-2.5 shadow-lg shadow-red-500/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-red-500/15">
            <Handle type="target" position={Position.Top} id="top-target" className="workflow-handle" />
            <Handle type="target" position={Position.Left} id="left-target" className="workflow-handle workflow-handle-side" />
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/15">
                <Square className="h-3.5 w-3.5 text-red-400" />
            </div>
            <span className="text-sm font-semibold text-red-400">End</span>
        </div>
    )
}

export const EndNode = memo(EndNodeComponent)
