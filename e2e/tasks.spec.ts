// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

/**
 * E2E — Critical path 3: Task creation
 *
 * Verifies: navigate to tasks → create task → assign agent → verify status
 */

import { test, expect } from '@playwright/test'

const TASK_TITLE = `E2E Task ${Date.now()}`

test.describe('Tasks', () => {
    test('create a task and verify it appears', async ({ page }) => {
        await page.goto('/tasks')

        // Click create button
        await page.getByRole('button', { name: /create|new|add/i }).click()

        // Fill in task form
        await page.getByLabel(/title|name/i).fill(TASK_TITLE)
        await page.getByLabel(/description|prompt/i).fill('E2E test task — safe to delete')

        // Select an agent if available
        const agentSelect = page.getByLabel(/agent/i)
        if (await agentSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await agentSelect.selectOption({ index: 1 })
        }

        // Submit
        await page.getByRole('button', { name: /save|create|submit/i }).click()

        // Task should appear in the list
        await expect(page.getByText(TASK_TITLE)).toBeVisible({ timeout: 10_000 })
    })

    test('task shows correct status', async ({ page }) => {
        await page.goto('/tasks')

        // Find our task
        const taskRow = page.locator(`text=${TASK_TITLE}`).locator('..')

        // Should have a status badge (pending, queued, etc.)
        await expect(
            taskRow.getByText(/pending|queued|idle|running/i),
        ).toBeVisible({ timeout: 5_000 })
    })
})
