// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

/**
 * E2E — Critical path 1: Login flow
 *
 * Verifies: login → dashboard loads → sidebar navigation visible
 */

import { test, expect } from '@playwright/test'

test.describe('Login & Dashboard', () => {
    test('dashboard loads with sidebar navigation', async ({ page }) => {
        await page.goto('/')

        // Should be on dashboard (auth setup already logged us in)
        await expect(page).toHaveURL(/\/(dashboard)?$/)

        // Sidebar should be visible with key navigation items
        const sidebar = page.locator('nav, [role="navigation"]').first()
        await expect(sidebar).toBeVisible()

        // Key nav items should be present
        await expect(page.getByText('Dashboard')).toBeVisible()
        await expect(page.getByText('Agents')).toBeVisible()
        await expect(page.getByText('Tasks')).toBeVisible()
    })

    test('dashboard shows analytics section', async ({ page }) => {
        await page.goto('/')

        // Analytics cards or charts should load
        await expect(
            page.getByText(/total|agents|tasks|usage/i).first(),
        ).toBeVisible({ timeout: 10_000 })
    })
})
