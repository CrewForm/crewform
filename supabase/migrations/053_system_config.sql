-- 053_system_config.sql
-- Key-value config table for platform-wide settings.
-- Used to store e.g. scanner_agent_id for the AI injection scan.

CREATE TABLE IF NOT EXISTS public.system_config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed for AI scan during agent submission)
CREATE POLICY "system_config_select" ON public.system_config
    FOR SELECT USING (auth.role() = 'authenticated');

-- Only super admins can insert
CREATE POLICY "system_config_insert" ON public.system_config
    FOR INSERT WITH CHECK (public.is_super_admin());

-- Only super admins can update
CREATE POLICY "system_config_update" ON public.system_config
    FOR UPDATE USING (public.is_super_admin());

-- Only super admins can delete
CREATE POLICY "system_config_delete" ON public.system_config
    FOR DELETE USING (public.is_super_admin());
