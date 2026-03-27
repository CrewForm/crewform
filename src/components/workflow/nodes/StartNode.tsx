// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Play } from 'lucide-react'

function StartNodeComponent() {
    return (
        <div className="workflow-start-node flex items-center gap-2 rounded-xl border-2 border-green-500/50 bg-green-500/5 px-4 py-2.5 shadow-lg shadow-green-500/10">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-500/15">
                <Play className="h-3.5 w-3.5 text-green-400" />
            </div>
            <span className="text-sm font-semibold text-green-400">Start</span>
            <Handle type="source" position={Position.Bottom} className="workflow-handle" />
        </div>
    )
}

export const StartNode = memo(StartNodeComponent)
