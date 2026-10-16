// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    fetchTaskAttachments,
    fetchTeamRunAttachments,
    uploadAttachments,
    deleteAttachment,
} from '@/db/attachments'
import type { FileAttachment } from '@/db/attachments'

/**
 * React Query hooks for file attachments.
 */

/** Fetch attachments for a task */
export function useTaskAttachments(taskId: string | undefined) {
    return useQuery<FileAttachment[]>({
        queryKey: ['attachments', 'task', taskId],
        queryFn: () => fetchTaskAttachments(taskId ?? ''),
        enabled: !!taskId,
    })
}

/** Fetch attachments for a team run */
export function useTeamRunAttachments(teamRunId: string | undefined) {
    return useQuery<FileAttachment[]>({
        queryKey: ['attachments', 'team_run', teamRunId],
        queryFn: () => fetchTeamRunAttachments(teamRunId ?? ''),
        enabled: !!teamRunId,
    })
}

/** Upload files mutation */
export function useUploadAttachments() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: uploadAttachments,
        onSuccess: (_data, variables) => {
            if (variables.taskId) {
                void queryClient.invalidateQueries({ queryKey: ['attachments', 'task', variables.taskId] })
            }
            if (variables.teamRunId) {
                void queryClient.invalidateQueries({ queryKey: ['attachments', 'team_run', variables.teamRunId] })
            }
        },
    })
}

/** Delete attachment mutation */
export function useDeleteAttachment() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, storagePath }: { id: string; storagePath: string }) =>
            deleteAttachment(id, storagePath),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['attachments'] })
        },
    })
}
