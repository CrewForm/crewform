-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 016_increment_install_rpc.sql — Atomic increment for agent install_count

CREATE OR REPLACE FUNCTION public.increment_install_count(agent_row_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.agents
    SET install_count = install_count + 1
    WHERE id = agent_row_id;
END;
$$;
