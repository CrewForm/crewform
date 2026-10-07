-- SPDX-License-Identifier: AGPL-3.0-or-later
ALTER TABLE public.team_runs DROP CONSTRAINT team_runs_status_check;
ALTER TABLE public.team_runs ADD CONSTRAINT team_runs_status_check CHECK(status IN('draft','pending','running','paused','completed','failed','cancelled'));
CREATE FUNCTION public.require_new_manual_run() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.status IN('completed','failed','cancelled') AND NEW.status IN('draft','pending','dispatched','running') THEN RAISE EXCEPTION 'Create a new run to repeat finished work'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER a_new_manual_run BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.require_new_manual_run();
CREATE TRIGGER a_new_manual_run BEFORE UPDATE ON public.team_runs FOR EACH ROW EXECUTE FUNCTION public.require_new_manual_run();
REVOKE ALL ON FUNCTION public.require_new_manual_run() FROM PUBLIC,anon,authenticated;
