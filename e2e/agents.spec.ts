// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

/**
 * E2E — Critical path 2: Agent CRUD
 *
 * Verifies: create agent → appears in list → edit → delete
 */

import { test, expect } from '@playwright/test'

const AGENT_NAME = `E2E Test Agent ${Date.now()}`
const AGENT_NAME_EDITED = `${AGENT_NAME} (edited)`

test.describe('Agent CRUD', () => {
    test.describe.configure({ mode: 'serial' })

    test('create a new agent', async ({ page }) => {
        await page.goto('/agents')

        // Click create button
        await page.getByRole('button', { name: /create|new|add/i }).click()

        // Fill in agent form
        await page.getByLabel(/name/i).fill(AGENT_NAME)
        await page.getByLabel(/description/i).fill('E2E test agent — safe to delete')

        // Submit
        await page.getByRole('button', { name: /save|create|submit/i }).click()

        // Agent should appear in the list
        await expect(page.getByText(AGENT_NAME)).toBeVisible({ timeout: 10_000 })
    })

    test('edit the agent', async ({ page }) => {
        await page.goto('/agents')

        // Find and click on the agent
        await page.getByText(AGENT_NAME).click()

        // Edit name
        const nameInput = page.getByLabel(/name/i)
        await nameInput.clear()
        await nameInput.fill(AGENT_NAME_EDITED)

        // Save
        await page.getByRole('button', { name: /save|update/i }).click()

        // Updated name should be visible
        await expect(page.getByText(AGENT_NAME_EDITED)).toBeVisible({ timeout: 10_000 })
    })

    test('delete the agent', async ({ page }) => {
        await page.goto('/agents')

        // Find the agent
        await page.getByText(AGENT_NAME_EDITED).click()

        // Click delete
        await page.getByRole('button', { name: /delete/i }).click()

        // Confirm deletion if there's a confirmation dialog
        const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i })
        if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await confirmBtn.click()
        }

        // Agent should no longer be in the list
        await expect(page.getByText(AGENT_NAME_EDITED)).not.toBeVisible({ timeout: 10_000 })
    })
})
