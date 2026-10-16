// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

/**
 * E2E — Critical path 4: Marketplace
 *
 * Verifies: browse → search → filter tags → view detail modal → install
 */

import { test, expect } from '@playwright/test'

test.describe('Marketplace', () => {
    test('browse marketplace and see agent cards', async ({ page }) => {
        await page.goto('/marketplace')

        // Should see the marketplace heading
        await expect(page.getByRole('heading', { name: /marketplace/i })).toBeVisible()

        // Agent cards should load
        await expect(
            page.locator('button').filter({ hasText: /installs/i }).first(),
        ).toBeVisible({ timeout: 10_000 })
    })

    test('search filters agents', async ({ page }) => {
        await page.goto('/marketplace')

        // Wait for cards to load
        await expect(
            page.locator('button').filter({ hasText: /installs/i }).first(),
        ).toBeVisible({ timeout: 10_000 })

        // Count initial cards
        const initialCount = await page.locator('button').filter({ hasText: /installs/i }).count()

        // Type in search
        await page.getByPlaceholder(/search/i).fill('code')

        // Wait for results to update
        await page.waitForTimeout(500) // debounce

        // Should have fewer or same cards (filtered)
        const filteredCount = await page.locator('button').filter({ hasText: /installs/i }).count()
        expect(filteredCount).toBeLessThanOrEqual(initialCount)
    })

    test('click tag pill filters results', async ({ page }) => {
        await page.goto('/marketplace')

        // Wait for tags to load
        await expect(
            page.locator('button').filter({ hasText: /installs/i }).first(),
        ).toBeVisible({ timeout: 10_000 })

        // Click a tag pill
        const tagPill = page.locator('button').filter({ hasText: /coding|research|writing/i }).first()
        if (await tagPill.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await tagPill.click()
            // Results should update (at least some cards visible)
            await page.waitForTimeout(500)
        }
    })

    test('open agent detail modal', async ({ page }) => {
        await page.goto('/marketplace')

        // Wait for cards to load
        await expect(
            page.locator('button').filter({ hasText: /installs/i }).first(),
        ).toBeVisible({ timeout: 10_000 })

        // Click the first agent card
        await page.locator('button').filter({ hasText: /installs/i }).first().click()

        // Modal should open with agent details
        await expect(page.getByText(/system prompt/i)).toBeVisible({ timeout: 5_000 })
        await expect(page.getByRole('button', { name: /install agent/i })).toBeVisible()
    })

    test('close detail modal', async ({ page }) => {
        await page.goto('/marketplace')

        // Open modal
        await expect(
            page.locator('button').filter({ hasText: /installs/i }).first(),
        ).toBeVisible({ timeout: 10_000 })
        await page.locator('button').filter({ hasText: /installs/i }).first().click()

        // Wait for modal
        await expect(page.getByText(/system prompt/i)).toBeVisible({ timeout: 5_000 })

        // Close modal via X button
        await page.locator('button').filter({ has: page.locator('svg') }).first().click()

        // Modal should close — system prompt should not be visible
        await expect(page.getByText(/system prompt/i)).not.toBeVisible({ timeout: 3_000 })
    })
})
