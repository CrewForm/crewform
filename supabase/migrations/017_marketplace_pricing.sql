-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 017_marketplace_pricing.sql — Add price column for paid marketplace agents

-- ────────────────────────────────────────────────────────────────────────────
-- ALTER agents — add optional price column
-- NULL = free, any value = paid (in USD cents for precision)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS price_cents INTEGER;

COMMENT ON COLUMN public.agents.price_cents IS 'Price in USD cents. NULL = free agent. 0 = explicitly free. >0 = paid.';
