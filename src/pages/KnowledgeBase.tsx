// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useRef } from 'react'
import { Upload, Trash2, FileText, RefreshCw, AlertCircle, CheckCircle2, Loader2, BookOpen } from 'lucide-react'
import { useKnowledgeDocuments, useUploadKnowledgeDocument, useDeleteKnowledgeDocument } from '@/hooks/useKnowledgeBase'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const ALLOWED_TYPES = [
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/html',
    'application/json',
]

const ALLOWED_EXTENSIONS = '.txt,.md,.csv,.html,.json'

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${String(bytes)} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusBadge(status: string) {
    switch (status) {
        case 'pending':
            return <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-400"><Loader2 className="h-3 w-3 animate-spin" />Pending</span>
        case 'processing':
            return <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400"><Loader2 className="h-3 w-3 animate-spin" />Processing</span>
        case 'ready':
            return <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400"><CheckCircle2 className="h-3 w-3" />Ready</span>
        case 'error':
            return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400"><AlertCircle className="h-3 w-3" />Error</span>
        default:
            return null
    }
}

export default function KnowledgeBase() {
    const { workspaceId } = useWorkspace()
    const { user } = useAuth()
    const { documents, isLoading } = useKnowledgeDocuments(workspaceId)
    const uploadMutation = useUploadKnowledgeDocument()
    const deleteMutation = useDeleteKnowledgeDocument()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [dragOver, setDragOver] = useState(false)

    function handleFiles(files: FileList | null) {
        if (!files || !workspaceId || !user) return

        for (const file of Array.from(files)) {
            if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(txt|md|csv|html|json)$/i)) {
                continue // skip unsupported types
            }
            uploadMutation.mutate({
                workspaceId,
                file,
                name: file.name.replace(/\.[^.]+$/, ''),
                userId: user.id,
            })
        }
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-100">Knowledge Base</h1>
                    <p className="mt-1 text-sm text-gray-400">
                        Upload documents to give your agents context. Supported: TXT, MD, CSV, HTML, JSON.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-primary/90"
                >
                    <Upload className="h-4 w-4" />
                    Upload
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ALLOWED_EXTENSIONS}
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                />
            </div>

            {/* Drop zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    handleFiles(e.dataTransfer.files)
                }}
                className={cn(
                    'mb-6 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
                    dragOver
                        ? 'border-brand-primary bg-brand-primary/5'
                        : 'border-gray-700 bg-surface-card',
                )}
            >
                <BookOpen className="mx-auto mb-3 h-10 w-10 text-gray-500" />
                <p className="text-sm text-gray-400">
                    Drag &amp; drop files here, or click <strong>Upload</strong> above
                </p>
                <p className="mt-1 text-xs text-gray-500">
                    TXT, Markdown, CSV, HTML, JSON — max 10 MB each
                </p>
            </div>

            {/* Document list */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                </div>
            ) : documents.length === 0 ? (
                <div className="rounded-xl border border-gray-800 bg-surface-card p-12 text-center">
                    <FileText className="mx-auto mb-3 h-10 w-10 text-gray-600" />
                    <p className="text-sm text-gray-400">No documents yet</p>
                    <p className="mt-1 text-xs text-gray-500">Upload files to build your knowledge base</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {documents.map((doc) => (
                        <div
                            key={doc.id}
                            className="flex items-center gap-4 rounded-xl border border-gray-800 bg-surface-card p-4 transition-colors hover:border-gray-700"
                        >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-800">
                                <FileText className="h-5 w-5 text-gray-400" />
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="truncate text-sm font-medium text-gray-200">{doc.name}</h3>
                                    {statusBadge(doc.status)}
                                </div>
                                <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
                                    <span>{doc.file_name}</span>
                                    <span>{formatFileSize(doc.file_size)}</span>
                                    {doc.status === 'ready' && (
                                        <span>{String(doc.chunk_count)} chunks</span>
                                    )}
                                </div>
                                {doc.status === 'error' && doc.error_message && (
                                    <p className="mt-1 text-xs text-red-400">{doc.error_message}</p>
                                )}
                            </div>

                            <div className="flex items-center gap-1">
                                {doc.status === 'error' && (
                                    <button
                                        type="button"
                                        onClick={() => uploadMutation.mutate({
                                            workspaceId: doc.workspace_id,
                                            file: new File([], doc.file_name), // re-process triggers via mutation
                                            name: doc.name,
                                            userId: user?.id ?? '',
                                        })}
                                        className="rounded p-1.5 text-gray-500 hover:text-gray-300"
                                        title="Retry processing"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => deleteMutation.mutate(doc)}
                                    className="rounded p-1.5 text-gray-500 hover:text-red-400"
                                    title="Delete document"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
