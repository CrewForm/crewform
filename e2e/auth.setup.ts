// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

/**
 * Auth setup — creates and saves authenticated browser state.
 *
 * This runs once before all other tests. The storage state is reused
 * by all test projects so we don't log in for every spec.
 *
 * Requires E2E_EMAIL and E2E_PASSWORD env vars (or defaults for local dev).
 */

import { test as setup, expect } from '@playwright/test'

const AUTH_FILE = 'e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
    const email = process.env.E2E_EMAIL ?? 'test@crewform.local'
    const password = process.env.E2E_PASSWORD ?? 'testpassword123'

    // Navigate to login page
    await page.goto('/login')

    // Fill in credentials
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: /sign in|log in/i }).click()

    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 10_000 })

    // Save authenticated state
    await page.context().storageState({ path: AUTH_FILE })
})
