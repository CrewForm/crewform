// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Play } from 'lucide-react'

function StartNodeComponent() {
    return (
        <div className="workflow-start-node workflow-glass-node flex items-center gap-2 rounded-xl border-2 border-green-500/50 px-4 py-2.5 shadow-lg shadow-green-500/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-500/15">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-500/15">
                <Play className="h-3.5 w-3.5 text-green-400 workflow-idle-pulse" />
            </div>
            <span className="text-sm font-semibold text-green-400">Start</span>
            <Handle type="source" position={Position.Bottom} id="bottom-source" className="workflow-handle" />
            <Handle type="source" position={Position.Right} id="right-source" className="workflow-handle workflow-handle-side" />
        </div>
    )
}

export const StartNode = memo(StartNodeComponent)
