// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import ReactMarkdown from 'react-markdown'

interface MarkdownContentProps {
    content: string
    className?: string
}

/**
 * Renders markdown content with styled prose.
 * Used for task output, team run results, and any LLM-generated text.
 */
export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
    return (
        <div className={`markdown-prose ${className}`}>
            <ReactMarkdown>{content}</ReactMarkdown>
        </div>
    )
}
