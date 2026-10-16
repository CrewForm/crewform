// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { z } from 'zod'

/**
 * Zod schema for task creation.
 */
export const taskSchema = z.object({
    title: z
        .string()
        .min(1, 'Title is required')
        .max(200, 'Title must be 200 characters or less')
        .trim(),
    description: z
        .string()
        .max(5000, 'Description must be 5,000 characters or less')
        .default(''),
    assigned_agent_id: z
        .string()
        .min(1, 'Please assign an agent'),
    priority: z
        .enum(['low', 'medium', 'high', 'urgent'])
        .default('medium'),
})

export type TaskFormData = z.infer<typeof taskSchema>
