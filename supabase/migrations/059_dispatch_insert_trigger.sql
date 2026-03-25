-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 059_dispatch_insert_trigger.sql
--
-- Fix: tasks created via messaging channels (Telegram, Discord, Slack, etc.)
-- are INSERTed directly with status='dispatched', bypassing the existing
-- AFTER UPDATE trigger that creates agent_tasks records.
-- This adds an AFTER INSERT trigger to cover that path.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add AFTER INSERT trigger for tasks inserted as 'dispatched'
-- ────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER trg_auto_dispatch_agent_task_on_insert
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  WHEN (NEW.status = 'dispatched' AND NEW.assigned_agent_id IS NOT NULL)
  EXECUTE FUNCTION public.auto_dispatch_agent_task();
