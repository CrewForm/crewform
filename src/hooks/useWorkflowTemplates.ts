// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    fetchPublishedTemplates,
    fetchTemplateById,
    fetchWorkspaceTemplates,
    fetchTemplateCategories,
    createWorkflowTemplate,
    updateWorkflowTemplate,
    deleteWorkflowTemplate,
    installTemplate,
    type WorkflowTemplateQueryOptions,
    type CreateWorkflowTemplateInput,
} from '@/db/workflowTemplates'
import type { WorkflowTemplate } from '@/types'

// ─── Query Keys ─────────────────────────────────────────────────────────────

const KEYS = {
    all: ['workflow-templates'] as const,
    published: (opts: WorkflowTemplateQueryOptions) =>
        [...KEYS.all, 'published', opts] as const,
    detail: (id: string) => [...KEYS.all, 'detail', id] as const,
    workspace: (workspaceId: string) =>
        [...KEYS.all, 'workspace', workspaceId] as const,
    categories: [...KEYS.all, 'categories'] as const,
}

// ─── Queries ────────────────────────────────────────────────────────────────

/** Browse published templates (marketplace) */
export function usePublishedTemplates(options: WorkflowTemplateQueryOptions = {}) {
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: KEYS.published(options),
        queryFn: () => fetchPublishedTemplates(options),
    })

    return {
        templates: data ?? [],
        isLoading,
        error,
        refetch,
    }
}

/** Fetch a single template by ID */
export function useTemplateDetail(id: string | null) {
    const { data, isLoading, error } = useQuery({
        queryKey: KEYS.detail(id ?? ''),
        queryFn: () => fetchTemplateById(id!),
        enabled: !!id,
    })

    return {
        template: data ?? null,
        isLoading,
        error,
    }
}

/** Fetch templates created by a workspace */
export function useWorkspaceTemplates(workspaceId: string | undefined) {
    const { data, isLoading, error } = useQuery({
        queryKey: KEYS.workspace(workspaceId ?? ''),
        queryFn: () => fetchWorkspaceTemplates(workspaceId!),
        enabled: !!workspaceId,
    })

    return {
        templates: data ?? [],
        isLoading,
        error,
    }
}

/** Fetch unique template categories */
export function useTemplateCategories() {
    const { data, isLoading } = useQuery({
        queryKey: KEYS.categories,
        queryFn: fetchTemplateCategories,
    })

    return {
        categories: data ?? [],
        isLoading,
    }
}

// ─── Mutations ──────────────────────────────────────────────────────────────

/** Create a new workflow template */
export function useCreateTemplate() {
    const qc = useQueryClient()

    return useMutation({
        mutationFn: (input: CreateWorkflowTemplateInput) =>
            createWorkflowTemplate(input),
        onSuccess: (template: WorkflowTemplate) => {
            void qc.invalidateQueries({ queryKey: KEYS.workspace(template.workspace_id) })
            void qc.invalidateQueries({ queryKey: KEYS.all })
        },
    })
}

/** Update a workflow template */
export function useUpdateTemplate() {
    const qc = useQueryClient()

    return useMutation({
        mutationFn: ({
            id,
            updates,
        }: {
            id: string
            updates: Partial<Omit<CreateWorkflowTemplateInput, 'workspace_id'>>
        }) => updateWorkflowTemplate(id, updates),
        onSuccess: (template: WorkflowTemplate) => {
            void qc.invalidateQueries({ queryKey: KEYS.detail(template.id) })
            void qc.invalidateQueries({ queryKey: KEYS.all })
        },
    })
}

/** Delete a workflow template */
export function useDeleteTemplate() {
    const qc = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => deleteWorkflowTemplate(id),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: KEYS.all })
        },
    })
}

/** Install a template into a workspace */
export function useInstallTemplate() {
    const qc = useQueryClient()

    return useMutation({
        mutationFn: ({
            templateId,
            workspaceId,
            variables,
        }: {
            templateId: string
            workspaceId: string
            variables: Record<string, string>
        }) => installTemplate(templateId, workspaceId, variables),
        onSuccess: () => {
            // Invalidate agents + teams since new ones were created
            void qc.invalidateQueries({ queryKey: ['agents'] })
            void qc.invalidateQueries({ queryKey: ['teams'] })
            void qc.invalidateQueries({ queryKey: KEYS.all })
        },
    })
}
