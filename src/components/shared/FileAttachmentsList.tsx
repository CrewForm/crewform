// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { FileText, Image, Download, Trash2, Loader2, Paperclip } from 'lucide-react'
import { getDownloadUrl, deleteAttachment } from '@/db/attachments'
import type { FileAttachment } from '@/db/attachments'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

interface FileAttachmentsListProps {
    attachments: FileAttachment[]
    /** Allow deleting files */
    canDelete?: boolean
    /** Query key to invalidate on delete */
    queryKey?: (string | undefined)[]
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageType(type: string): boolean {
    return type.startsWith('image/')
}

/**
 * Displays attached files grouped by direction (input/output).
 * Supports download via signed URLs and optional delete.
 */
export function FileAttachmentsList({
    attachments,
    canDelete = false,
    queryKey,
}: FileAttachmentsListProps) {
    const queryClient = useQueryClient()

    const inputFiles = attachments.filter((f) => f.direction === 'input')
    const outputFiles = attachments.filter((f) => f.direction === 'output')

    if (attachments.length === 0) return null

    return (
        <div className="space-y-4">
            {inputFiles.length > 0 && (
                <FileSection
                    title="Input Files"
                    files={inputFiles}
                    canDelete={canDelete}
                    queryKey={queryKey}
                    queryClient={queryClient}
                />
            )}
            {outputFiles.length > 0 && (
                <FileSection
                    title="Generated Files"
                    files={outputFiles}
                    canDelete={false}
                    queryKey={queryKey}
                    queryClient={queryClient}
                />
            )}
        </div>
    )
}

function FileSection({
    title,
    files,
    canDelete,
    queryKey,
    queryClient,
}: {
    title: string
    files: FileAttachment[]
    canDelete: boolean
    queryKey?: (string | undefined)[]
    queryClient: ReturnType<typeof useQueryClient>
}) {
    return (
        <div>
            <div className="mb-2 flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 text-gray-500" />
                <h4 className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    {title} ({files.length})
                </h4>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {files.map((file) => (
                    <FileCard
                        key={file.id}
                        file={file}
                        canDelete={canDelete}
                        onDeleted={() => {
                            if (queryKey) {
                                void queryClient.invalidateQueries({ queryKey })
                            }
                        }}
                    />
                ))}
            </div>
        </div>
    )
}

function FileCard({
    file,
    canDelete,
    onDeleted,
}: {
    file: FileAttachment
    canDelete: boolean
    onDeleted: () => void
}) {
    const [isDownloading, setIsDownloading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    async function handleDownload() {
        setIsDownloading(true)
        try {
            const url = await getDownloadUrl(file.storage_path)
            const a = document.createElement('a')
            a.href = url
            a.download = file.file_name
            a.target = '_blank'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
        } catch (err) {
            console.error('Download failed:', err)
        } finally {
            setIsDownloading(false)
        }
    }

    async function handleDelete() {
        if (!confirm(`Delete "${file.file_name}"?`)) return
        setIsDeleting(true)
        try {
            await deleteAttachment(file.id, file.storage_path)
            onDeleted()
        } catch (err) {
            console.error('Delete failed:', err)
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-card px-3 py-2.5">
            {/* Icon */}
            <div
                className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    isImageType(file.file_type) ? 'bg-green-500/10' : 'bg-blue-500/10',
                )}
            >
                {isImageType(file.file_type) ? (
                    <Image className="h-4 w-4 text-green-400" />
                ) : (
                    <FileText className="h-4 w-4 text-blue-400" />
                )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-300">{file.file_name}</p>
                <p className="text-[10px] text-gray-600">{formatSize(file.file_size)}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => void handleDownload()}
                    disabled={isDownloading}
                    title="Download"
                    className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-brand-primary/10 hover:text-brand-primary disabled:opacity-50"
                >
                    {isDownloading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Download className="h-3.5 w-3.5" />
                    )}
                </button>
                {canDelete && (
                    <button
                        type="button"
                        onClick={() => void handleDelete()}
                        disabled={isDeleting}
                        title="Delete"
                        className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                    >
                        {isDeleting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                        )}
                    </button>
                )}
            </div>
        </div>
    )
}
