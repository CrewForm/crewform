-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 067_api_keys_base_url.sql — Add base_url column to api_keys for custom endpoints (e.g. Ollama)

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS base_url TEXT;

COMMENT ON COLUMN public.api_keys.base_url IS
  'Optional custom base URL for the provider API endpoint. Used for self-hosted services like Ollama.';
