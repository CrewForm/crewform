// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      strict: true,
      // Preserve Vite's default private-file exclusions and also protect the
      // generated local backend configuration, CLI state and database archives.
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**',
        '**/*.env', '**/.crewform-local/**', '**/supabase/.temp/**', '**/*.dump'],
    },
  },
  build: {
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/recharts/')) return 'recharts'
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react-router')) {
            return 'react-vendor'
          }
          if (id.includes('/node_modules/@supabase/')) return 'supabase'
        },
      },
    },
  },
})
