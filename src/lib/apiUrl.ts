// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Returns the public-facing API base URL.
 *
 * In production this is `https://api.crewform.tech` (set via VITE_API_URL).
 * Falls back to the raw Supabase URL for local development.
 */
export function getApiUrl(): string {
  return (import.meta.env.VITE_API_URL as string | undefined)
    ?? (import.meta.env.VITE_SUPABASE_URL as string)
}
