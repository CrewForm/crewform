-- Migration: Add prompt/completion token breakdown to usage_records
-- These columns default to 0 so existing rows are unaffected.

ALTER TABLE usage_records
  ADD COLUMN IF NOT EXISTS prompt_tokens integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_tokens integer DEFAULT 0;
