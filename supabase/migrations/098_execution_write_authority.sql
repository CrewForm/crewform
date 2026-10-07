-- SPDX-License-Identifier: AGPL-3.0-or-later
CREATE FUNCTION public.protect_execution_state() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF auth.role()='authenticated' AND NOT public.is_super_admin() AND TG_OP='UPDATE' THEN
  IF OLD.status IN('running','waiting_for_input','paused') AND
   ((to_jsonb(NEW)-'status'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updated_at') OR NEW.status NOT IN(OLD.status,'cancelled')) THEN
   RAISE EXCEPTION 'Active execution is server-owned; cancel before editing';
  END IF;
  IF NEW.status NOT IN('pending','dispatched') AND
   ((to_jsonb(NEW)->'interaction_context') IS DISTINCT FROM (to_jsonb(OLD)->'interaction_context') OR
    (to_jsonb(NEW)->'result') IS DISTINCT FROM (to_jsonb(OLD)->'result') OR
    (to_jsonb(NEW)->'output') IS DISTINCT FROM (to_jsonb(OLD)->'output') OR
    (to_jsonb(NEW)->'claimed_by_runner') IS DISTINCT FROM (to_jsonb(OLD)->'claimed_by_runner')) THEN RAISE EXCEPTION 'Execution results and interaction state are server-owned'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER aa_execution_state BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.protect_execution_state();
CREATE TRIGGER aa_execution_state BEFORE UPDATE ON public.team_runs FOR EACH ROW EXECUTE FUNCTION public.protect_execution_state();
REVOKE ALL ON FUNCTION public.protect_execution_state() FROM PUBLIC,anon,authenticated;
