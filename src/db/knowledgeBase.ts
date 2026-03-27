// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from '@/lib/supabase'
import { enforceQuota } from '@/lib/enforceQuota'

export interface KnowledgeDocument {
    id: string
    workspace_id: string
    name: string
    file_name: string
    file_type: string
    file_size: number
    storage_path: string
    status: 'pending' | 'processing' | 'ready' | 'error'
    error_message: string | null
    chunk_count: number
    created_by: string | null
    created_at: string
    updated_at: string
}

const BUCKET = 'knowledge'

/** Fetch all knowledge documents for a workspace */
export async function fetchKnowledgeDocuments(workspaceId: string): Promise<KnowledgeDocument[]> {
    const { data, error } = await supabase
        .from('knowledge_documents')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })

    if (error) throw error
    return data as KnowledgeDocument[]
}

/** Upload a document and create a DB record */
export async function uploadKnowledgeDocument(
    workspaceId: string,
    file: File,
    name: string,
    userId: string,
): Promise<KnowledgeDocument> {
    // Check knowledge document quota before uploading
    await enforceQuota(workspaceId, 'knowledge_documents')

    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${workspaceId}/${String(timestamp)}_${safeName}`

    // 1. Upload to storage
    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
        })

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

    // 2. Insert DB record
    const result = await supabase
        .from('knowledge_documents')
        .insert({
            workspace_id: workspaceId,
            name: name || file.name,
            file_name: file.name,
            file_type: file.type || 'text/plain',
            file_size: file.size,
            storage_path: storagePath,
            created_by: userId,
        })
        .select()
        .single()

    if (result.error) {
        await supabase.storage.from(BUCKET).remove([storagePath])
        throw result.error
    }

    return result.data as KnowledgeDocument
}

/** Update a document's status (used when processing invocation fails client-side) */
export async function updateDocumentStatus(
    documentId: string,
    status: 'pending' | 'processing' | 'ready' | 'error',
    errorMessage?: string,
): Promise<void> {
    const { error } = await supabase
        .from('knowledge_documents')
        .update({ status, error_message: errorMessage ?? null })
        .eq('id', documentId)

    if (error) throw error
}

/** Trigger processing (chunking + embedding) for a document */
export async function processKnowledgeDocument(documentId: string): Promise<void> {
    const result = await supabase.functions.invoke('kb-process', {
        body: { document_id: documentId },
    })

    if (result.error) {
        const errObj = result.error as { message?: string }
        throw new Error(errObj.message ?? 'Processing request failed')
    }

    const response = result.data as { error?: string }
    if (response.error) {
        throw new Error(response.error)
    }
}

/** Delete a knowledge document, its chunks, and storage file */
export async function deleteKnowledgeDocument(doc: KnowledgeDocument): Promise<void> {
    // Delete storage file first
    await supabase.storage.from(BUCKET).remove([doc.storage_path])

    // DB record + chunks cascade-deleted
    const { error } = await supabase
        .from('knowledge_documents')
        .delete()
        .eq('id', doc.id)

    if (error) throw error
}
