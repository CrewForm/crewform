// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
    fetchKnowledgeDocuments,
    uploadKnowledgeDocument,
    processKnowledgeDocument,
    deleteKnowledgeDocument,
} from '@/db/knowledgeBase'
import type { KnowledgeDocument } from '@/db/knowledgeBase'

/** Fetch all knowledge documents for a workspace */
export function useKnowledgeDocuments(workspaceId: string | null) {
    const query = useQuery({
        queryKey: ['knowledge-documents', workspaceId],
        queryFn: () => fetchKnowledgeDocuments(workspaceId ?? ''),
        enabled: !!workspaceId,
        refetchInterval: 5000, // poll for status updates during processing
    })

    return {
        documents: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
    }
}

/** Upload a document and trigger processing */
export function useUploadKnowledgeDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({
            workspaceId,
            file,
            name,
            userId,
        }: {
            workspaceId: string
            file: File
            name: string
            userId: string
        }) => {
            // 1. Upload + DB record
            const doc = await uploadKnowledgeDocument(workspaceId, file, name, userId)
            // 2. Trigger processing (fire-and-forget — status polled via refetchInterval)
            void processKnowledgeDocument(doc.id)
            return doc
        },
        onSuccess: (data, variables) => {
            toast.success(`Uploaded "${data.name}" — processing started`)
            void qc.invalidateQueries({ queryKey: ['knowledge-documents', variables.workspaceId] })
        },
        onError: (error: Error) => {
            toast.error(`Upload failed: ${error.message}`)
        },
    })
}

/** Delete a document */
export function useDeleteKnowledgeDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (doc: KnowledgeDocument) => deleteKnowledgeDocument(doc),
        onSuccess: () => {
            toast.success('Document deleted')
            void qc.invalidateQueries({ queryKey: ['knowledge-documents'] })
        },
        onError: (error: Error) => {
            toast.error(`Delete failed: ${error.message}`)
        },
    })
}
