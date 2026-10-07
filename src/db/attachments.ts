// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'

/**
 * Supabase data access layer for file attachments.
 */

const BUCKET = 'attachments'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILES = 5

export interface FileAttachment {
    id: string
    workspace_id: string
    task_id: string | null
    team_run_id: string | null
    direction: 'input' | 'output'
    file_name: string
    file_type: string
    file_size: number
    storage_path: string
    created_by: string | null
    created_at: string
}

// ─── Queries ────────────────────────────────────────────────────────────────

/** Fetch attachments for a task */
export async function fetchTaskAttachments(taskId: string): Promise<FileAttachment[]> {
    const { data, error } = await supabase
        .from('file_attachments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })

    if (error) throw error
    return data as FileAttachment[]
}

/** Fetch attachments for a team run */
export async function fetchTeamRunAttachments(teamRunId: string): Promise<FileAttachment[]> {
    const { data, error } = await supabase
        .from('file_attachments')
        .select('*')
        .eq('team_run_id', teamRunId)
        .order('created_at', { ascending: true })

    if (error) throw error
    return data as FileAttachment[]
}

// ─── Upload ─────────────────────────────────────────────────────────────────

interface UploadParams {
    workspaceId: string
    taskId?: string
    teamRunId?: string
    direction: 'input' | 'output'
    file: File
    userId?: string
}

/** Validate file before upload */
function validateFile(file: File): void {
    if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File "${file.name}" exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit.`)
    }
}

/** Upload a file to Supabase Storage and create DB record */
export async function uploadAttachment({
    workspaceId,
    taskId,
    teamRunId,
    direction,
    file,
    userId,
}: UploadParams): Promise<FileAttachment> {
    validateFile(file)

    // Generate unique storage path: {workspaceId}/{taskId|teamRunId}/{direction}/{timestamp}_{filename}
    const parentId = taskId ?? teamRunId ?? 'unknown'
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${workspaceId}/${parentId}/${direction}/${timestamp}_${safeName}`

    // 1. Upload to storage
    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
            contentType: file.type,
            upsert: false,
        })

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

    // 2. Insert DB record
    const result = await supabase
        .from('file_attachments')
        .insert({
            workspace_id: workspaceId,
            task_id: taskId ?? null,
            team_run_id: teamRunId ?? null,
            direction,
            file_name: file.name,
            file_type: file.type || 'application/octet-stream',
            file_size: file.size,
            storage_path: storagePath,
            created_by: userId ?? null,
        })
        .select()
        .single()

    if (result.error) {
        // Cleanup uploaded file on DB error
        await supabase.storage.from(BUCKET).remove([storagePath])
        throw result.error
    }

    return result.data as FileAttachment
}

/** Upload multiple files */
export async function uploadAttachments(
    params: Omit<UploadParams, 'file'> & { files: File[] },
): Promise<FileAttachment[]> {
    if (params.files.length > MAX_FILES) {
        throw new Error(`Maximum ${MAX_FILES} files allowed.`)
    }

    const results: FileAttachment[] = []
    for (const file of params.files) {
        const attachment = await uploadAttachment({ ...params, file })
        results.push(attachment)
    }
    return results
}

// ─── Download ───────────────────────────────────────────────────────────────

/** Get a signed download URL (valid for 1 hour) */
export async function getDownloadUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, 3600) // 1 hour

    if (error) throw error
    return data.signedUrl
}

// ─── Delete ─────────────────────────────────────────────────────────────────

/** Delete attachment from both storage and database */
export async function deleteAttachment(id: string, storagePath: string): Promise<void> {
    // Delete from storage first
    await supabase.storage.from(BUCKET).remove([storagePath])

    // Delete DB record
    const { error } = await supabase
        .from('file_attachments')
        .delete()
        .eq('id', id)

    if (error) throw error
}

// ─── Constants (exported for UI validation) ─────────────────────────────────

export const ATTACHMENT_LIMITS = {
    maxFileSize: MAX_FILE_SIZE,
    maxFiles: MAX_FILES,
    allowedTypes: [
        'text/plain', 'text/csv', 'text/markdown', 'text/html',
        'application/json', 'application/pdf',
        'image/png', 'image/jpeg', 'image/webp', 'image/gif',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
} as const

/** Copy reviewed inputs to a new draft; never reuse a foreign parent/path. */
export async function copyInputAttachments(workspaceId: string, sourceId: string, targetId: string, kind: 'task' | 'team', userId: string): Promise<void> {
    const rows = kind === 'task' ? await fetchTaskAttachments(sourceId) : await fetchTeamRunAttachments(sourceId)
    for (const row of rows.filter(value => value.direction === 'input')) {
        if (row.workspace_id !== workspaceId || !row.storage_path.startsWith(`${workspaceId}/${sourceId}/input/`)) throw new Error('Invalid attachment scope')
        const {data, error} = await supabase.storage.from(BUCKET).download(row.storage_path)
        if (error) throw new Error('Input download failed; the new run remains a draft')
        await uploadAttachment({workspaceId,taskId:kind === 'task' ? targetId : undefined,teamRunId:kind === 'team' ? targetId : undefined,direction:'input',userId,file:new File([data],row.file_name,{type:row.file_type})})
    }
}
