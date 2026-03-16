-- 052_admin_agents_read_policy.sql
-- Allow super admins to read and update agents from any workspace.
-- Required for the Review Queue to fetch submitted agent data cross-workspace
-- and for approveSubmission to set is_published = true.

CREATE POLICY "agents_select_admin" ON public.agents
  FOR SELECT USING (public.is_super_admin());

CREATE POLICY "agents_update_admin" ON public.agents
  FOR UPDATE USING (public.is_super_admin());
