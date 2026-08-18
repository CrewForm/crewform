// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        exclude: ['dist/**', 'node_modules/**'],
    },
})
