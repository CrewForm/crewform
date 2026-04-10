// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Sticky note node for the workflow canvas.
 *
 * Visual-only annotation — no connection handles.
 * Double-click to edit, blur/Escape to save.
 * Supports color presets for organisation.
 */

import { memo, useState, useRef, useEffect, useCallback } from 'react'
import type { NodeProps } from '@xyflow/react'
import { StickyNote } from 'lucide-react'

export interface NoteNodeData {
    content: string
    color?: NoteColor
    [key: string]: unknown
}

export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple'

const COLOR_MAP: Record<NoteColor, { bg: string; border: string; text: string }> = {
    yellow: {
        bg: 'bg-amber-400/10',
        border: 'border-amber-400/30',
        text: 'text-amber-200',
    },
    blue: {
        bg: 'bg-sky-400/10',
        border: 'border-sky-400/30',
        text: 'text-sky-200',
    },
    green: {
        bg: 'bg-emerald-400/10',
        border: 'border-emerald-400/30',
        text: 'text-emerald-200',
    },
    pink: {
        bg: 'bg-pink-400/10',
        border: 'border-pink-400/30',
        text: 'text-pink-200',
    },
    purple: {
        bg: 'bg-violet-400/10',
        border: 'border-violet-400/30',
        text: 'text-violet-200',
    },
}

function NoteNodeComponent({ data, selected }: NodeProps) {
    const noteData = data as unknown as NoteNodeData
    const colorKey = noteData.color ?? 'yellow'
    const colors = COLOR_MAP[colorKey]
    const [isEditing, setIsEditing] = useState(false)
    const [editContent, setEditContent] = useState(noteData.content)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Sync external data changes
    useEffect(() => {
        if (!isEditing) {
            setEditContent(noteData.content)
        }
    }, [noteData.content, isEditing])

    // Auto-focus on edit
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus()
            textareaRef.current.select()
        }
    }, [isEditing])

    const handleSave = useCallback(() => {
        setIsEditing(false)
        // Persist via data update — parent will handle save
        if (editContent !== noteData.content) {
            noteData.content = editContent
        }
    }, [editContent, noteData])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setEditContent(noteData.content) // revert
            setIsEditing(false)
        }
        // Stop propagation to prevent canvas keyboard shortcuts while editing
        e.stopPropagation()
    }, [noteData.content])

    return (
        <div
            className={`rounded-lg border-2 ${colors.bg} ${colors.border} backdrop-blur-sm px-3 py-2.5 shadow-md transition-all ${
                selected ? 'ring-2 ring-brand-primary/40' : ''
            }`}
            style={{ minWidth: 140, maxWidth: 260 }}
            onDoubleClick={(e) => {
                e.stopPropagation()
                setIsEditing(true)
            }}
        >
            <div className="flex items-start gap-1.5 mb-1">
                <StickyNote className={`h-3 w-3 mt-0.5 shrink-0 ${colors.text} opacity-50`} />
                <span className="text-[9px] font-medium uppercase tracking-wider text-gray-600">
                    Note
                </span>
            </div>

            {isEditing ? (
                <textarea
                    ref={textareaRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    className={`w-full bg-transparent border-none outline-none resize-none text-xs ${colors.text} placeholder-gray-600`}
                    placeholder="Type a note..."
                    rows={3}
                />
            ) : (
                <p className={`text-xs leading-relaxed whitespace-pre-wrap ${colors.text} ${
                    noteData.content ? '' : 'italic opacity-40'
                }`}>
                    {noteData.content || 'Double-click to edit…'}
                </p>
            )}
        </div>
    )
}

export const NoteNode = memo(NoteNodeComponent)
