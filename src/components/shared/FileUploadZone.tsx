// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useState, useCallback, useRef } from 'react'
import { Upload, X, FileText, Image } from 'lucide-react'
import { ATTACHMENT_LIMITS } from '@/db/attachments'
import { cn } from '@/lib/utils'

interface FileUploadZoneProps {
    /** Currently selected files */
    files: File[]
    /** Called when files change (add/remove) */
    onChange: (files: File[]) => void
    /** Disable interactions */
    disabled?: boolean
    /** Additional CSS classes */
    className?: string
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
 * Drag-and-drop + click-to-browse file upload zone.
 * Validates file types and sizes client-side.
 */
export function FileUploadZone({
    files,
    onChange,
    disabled = false,
    className = '',
}: FileUploadZoneProps) {
    const [isDragging, setIsDragging] = useState(false)
    const [error, setError] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const addFiles = useCallback(
        (newFiles: FileList | File[]) => {
            setError('')
            const incoming = Array.from(newFiles)

            // Check total count
            if (files.length + incoming.length > ATTACHMENT_LIMITS.maxFiles) {
                setError(`Maximum ${ATTACHMENT_LIMITS.maxFiles} files allowed.`)
                return
            }

            // Validate each file
            const valid: File[] = []
            for (const file of incoming) {
                if (file.size > ATTACHMENT_LIMITS.maxFileSize) {
                    setError(`"${file.name}" exceeds ${formatSize(ATTACHMENT_LIMITS.maxFileSize)} limit.`)
                    return
                }
                // Check for duplicates
                if (files.some((f) => f.name === file.name && f.size === file.size)) {
                    continue // skip duplicate
                }
                valid.push(file)
            }

            if (valid.length > 0) {
                onChange([...files, ...valid])
            }
        },
        [files, onChange],
    )

    function handleDrop(e: React.DragEvent) {
        e.preventDefault()
        setIsDragging(false)
        if (!disabled && e.dataTransfer.files.length > 0) {
            addFiles(e.dataTransfer.files)
        }
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault()
        if (!disabled) setIsDragging(true)
    }

    function handleDragLeave() {
        setIsDragging(false)
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        if (e.target.files && e.target.files.length > 0) {
            addFiles(e.target.files)
            e.target.value = '' // reset so same file can be re-selected
        }
    }

    function removeFile(index: number) {
        onChange(files.filter((_, i) => i !== index))
        setError('')
    }

    return (
        <div className={className}>
            {/* Drop zone */}
            {files.length < ATTACHMENT_LIMITS.maxFiles && (
                <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => !disabled && inputRef.current?.click()}
                    className={cn(
                        'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-3 transition-colors',
                        isDragging
                            ? 'border-brand-primary bg-brand-primary/5'
                            : 'border-border hover:border-gray-500',
                        disabled && 'cursor-not-allowed opacity-50',
                    )}
                >
                    <Upload className="h-5 w-5 text-gray-500" />
                    <p className="text-xs text-gray-500">
                        <span className="font-medium text-gray-400">Click to upload</span> or drag & drop
                    </p>
                    <p className="text-[10px] text-gray-600">
                        Max {formatSize(ATTACHMENT_LIMITS.maxFileSize)} per file · {ATTACHMENT_LIMITS.maxFiles - files.length} remaining
                    </p>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        onChange={handleChange}
                        accept={ATTACHMENT_LIMITS.allowedTypes.join(',')}
                        className="hidden"
                        disabled={disabled}
                    />
                </div>
            )}

            {/* Error */}
            {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}

            {/* File list */}
            {files.length > 0 && (
                <div className="mt-2 space-y-1.5">
                    {files.map((file, i) => (
                        <div
                            key={`${file.name}-${file.size}`}
                            className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-raised px-3 py-2"
                        >
                            {isImageType(file.type) ? (
                                <Image className="h-4 w-4 shrink-0 text-green-400" />
                            ) : (
                                <FileText className="h-4 w-4 shrink-0 text-blue-400" />
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-gray-300">
                                    {file.name}
                                </p>
                                <p className="text-[10px] text-gray-600">
                                    {formatSize(file.size)}
                                </p>
                            </div>
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={() => removeFile(i)}
                                    className="rounded p-0.5 text-gray-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
