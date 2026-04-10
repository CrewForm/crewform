// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Keyboard shortcuts help overlay.
 *
 * Glassmorphism modal listing all available canvas keyboard shortcuts.
 * Triggered by pressing `?` or the ⌨ button in the info panel.
 */

import { useEffect, useRef } from 'react'
import { Keyboard, X } from 'lucide-react'

interface KeyboardShortcutsOverlayProps {
    onClose: () => void
}

interface ShortcutGroup {
    title: string
    shortcuts: { keys: string; description: string }[]
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        title: 'Navigation',
        shortcuts: [
            { keys: 'F', description: 'Fit view' },
            { keys: 'L', description: 'Auto-layout' },
            { keys: 'Scroll', description: 'Zoom in/out' },
            { keys: 'Drag', description: 'Pan canvas' },
        ],
    },
    {
        title: 'Editing',
        shortcuts: [
            { keys: '⌘ Z', description: 'Undo' },
            { keys: '⌘ ⇧ Z', description: 'Redo' },
            { keys: '⌘ C', description: 'Copy selected nodes' },
            { keys: '⌘ V', description: 'Paste nodes' },
            { keys: '⌘ A', description: 'Select all nodes' },
            { keys: 'Delete', description: 'Remove selected node' },
        ],
    },
    {
        title: 'Panels',
        shortcuts: [
            { keys: 'T', description: 'Toggle transcript' },
            { keys: '?', description: 'Toggle this help' },
        ],
    },
    {
        title: 'Interaction',
        shortcuts: [
            { keys: 'Click', description: 'Select node / show details' },
            { keys: 'Right-click', description: 'Context menu' },
            { keys: 'Escape', description: 'Deselect / close panel' },
        ],
    },
]

export function KeyboardShortcutsOverlay({ onClose }: KeyboardShortcutsOverlayProps) {
    const overlayRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (overlayRef.current && !overlayRef.current.contains(e.target as HTMLElement)) {
                onClose()
            }
        }
        function handleEscape(e: KeyboardEvent) {
            if (e.key === 'Escape' || e.key === '?') {
                e.preventDefault()
                onClose()
            }
        }
        document.addEventListener('mousedown', handleClick)
        document.addEventListener('keydown', handleEscape)
        return () => {
            document.removeEventListener('mousedown', handleClick)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [onClose])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div
                ref={overlayRef}
                className="workflow-glass-popup workflow-popup-enter rounded-2xl p-5 w-80 max-h-[500px] overflow-y-auto"
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Keyboard className="h-4 w-4 text-brand-primary" />
                        <h2 className="text-sm font-semibold text-gray-100">Keyboard Shortcuts</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded p-1 text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>

                {/* Groups */}
                <div className="space-y-4">
                    {SHORTCUT_GROUPS.map((group) => (
                        <div key={group.title}>
                            <h3 className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-2">
                                {group.title}
                            </h3>
                            <div className="space-y-1">
                                {group.shortcuts.map((shortcut) => (
                                    <div
                                        key={shortcut.description}
                                        className="flex items-center justify-between py-1"
                                    >
                                        <span className="text-[11px] text-gray-400">
                                            {shortcut.description}
                                        </span>
                                        <kbd className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-gray-400">
                                            {shortcut.keys}
                                        </kbd>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
