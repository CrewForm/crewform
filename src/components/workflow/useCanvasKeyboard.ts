// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Comprehensive keyboard shortcut handler for the workflow canvas.
 *
 * Centralizes all keyboard interactions:
 *  - Ctrl+C: copy selected nodes
 *  - Ctrl+V: paste copied nodes
 *  - Delete/Backspace: delete selected nodes
 *  - Ctrl+A: select all nodes
 *  - F: fit view
 *  - L: auto-layout
 *  - T: toggle transcript panel
 *  - ? or Ctrl+/: toggle shortcuts help
 *  - Escape: deselect / close popup / close menu
 */

import { useEffect, useCallback } from 'react'

interface CanvasKeyboardActions {
    onUndo: () => void
    onRedo: () => void
    onCopy: () => void
    onPaste: () => void
    onFitView: () => void
    onAutoLayout: () => void
    onToggleTranscript: () => void
    onToggleShortcuts: () => void
    onEscape: () => void
    onSelectAll: () => void
}

export function useCanvasKeyboard(actions: CanvasKeyboardActions) {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Ignore when typing in inputs/textareas
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return
        }

        const isCmd = e.metaKey || e.ctrlKey

        // Undo: Ctrl+Z
        if (isCmd && !e.shiftKey && e.key === 'z') {
            e.preventDefault()
            actions.onUndo()
            return
        }

        // Redo: Ctrl+Shift+Z
        if (isCmd && e.shiftKey && e.key === 'z') {
            e.preventDefault()
            actions.onRedo()
            return
        }

        // Copy: Ctrl+C
        if (isCmd && e.key === 'c') {
            e.preventDefault()
            actions.onCopy()
            return
        }

        // Paste: Ctrl+V
        if (isCmd && e.key === 'v') {
            e.preventDefault()
            actions.onPaste()
            return
        }

        // Select all: Ctrl+A
        if (isCmd && e.key === 'a') {
            e.preventDefault()
            actions.onSelectAll()
            return
        }

        // Shortcuts help: ? or Ctrl+/
        if (e.key === '?' || (isCmd && e.key === '/')) {
            e.preventDefault()
            actions.onToggleShortcuts()
            return
        }

        // Single-key shortcuts (no modifier)
        if (!isCmd && !e.altKey) {
            switch (e.key) {
                case 'f':
                case 'F':
                    e.preventDefault()
                    actions.onFitView()
                    break
                case 'l':
                case 'L':
                    e.preventDefault()
                    actions.onAutoLayout()
                    break
                case 't':
                case 'T':
                    e.preventDefault()
                    actions.onToggleTranscript()
                    break
                case 'Escape':
                    e.preventDefault()
                    actions.onEscape()
                    break
            }
        }
    }, [actions])

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])
}

