-- SPDX-License-Identifier: AGPL-3.0-or-later
-- A task SET NULL and trigger CASCADE can fire in either order during workspace
-- deletion. Check the surviving trigger reference at transaction end, after the
-- cascade removes its log rows. Ordinary writes still require a valid trigger.
ALTER TABLE public.trigger_log ALTER CONSTRAINT trigger_log_trigger_id_fkey DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE public.widget_rate_windows (
    widget_id uuid NOT NULL REFERENCES public.chat_widget_configs(id) ON DELETE CASCADE,
    window_start timestamptz NOT NULL,
    requests integer NOT NULL DEFAULT 0,
    PRIMARY KEY(widget_id,window_start)
);
ALTER TABLE public.widget_rate_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.widget_rate_windows FROM anon,authenticated;
GRANT ALL ON public.widget_rate_windows TO service_role;
CREATE FUNCTION public.reserve_chat_request(p_widget_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_widget public.chat_widget_configs%ROWTYPE; v_count integer; v_ws uuid;
BEGIN
    SELECT workspace_id INTO STRICT v_ws FROM public.chat_widget_configs WHERE id=p_widget_id;
    PERFORM 1 FROM public.workspaces WHERE id=v_ws AND suspended_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT * INTO STRICT v_widget FROM public.chat_widget_configs WHERE id=p_widget_id AND is_active;
    -- This aggregate allowance cannot be reset by visitor IDs or worker replicas.
    IF (SELECT count(*) FROM public.tasks WHERE workspace_id=v_ws AND status IN ('dispatched','running','waiting_for_input') AND metadata->>'widget_config_id'=p_widget_id::text)>=3 THEN RETURN false; END IF;
    INSERT INTO public.widget_rate_windows(widget_id,window_start,requests) VALUES(p_widget_id,date_trunc('hour',now()),1)
    ON CONFLICT(widget_id,window_start) DO UPDATE SET requests=public.widget_rate_windows.requests+1 RETURNING requests INTO v_count;
    DELETE FROM public.widget_rate_windows WHERE widget_id=p_widget_id AND window_start<now()-interval '2 days';
    RETURN v_count<=least(greatest(v_widget.rate_limit_per_hour,1),500);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_chat_request(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_chat_request(uuid) TO service_role;
-- Bounded session history and a short default retention; clean up on accepted work.
CREATE FUNCTION public.trim_chat_history() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
    NEW.messages := coalesce((SELECT jsonb_agg(value ORDER BY ord) FROM jsonb_array_elements(NEW.messages) WITH ORDINALITY AS e(value,ord)
      WHERE ord>greatest(jsonb_array_length(NEW.messages)-40,0)),'[]'::jsonb);
    RETURN NEW;
END;
$$;
CREATE TRIGGER trim_chat_history BEFORE INSERT OR UPDATE OF messages ON public.chat_sessions FOR EACH ROW EXECUTE FUNCTION public.trim_chat_history();

CREATE TABLE public.scheduled_firings (
    trigger_id uuid NOT NULL REFERENCES public.agent_triggers(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    slot timestamptz NOT NULL,
    task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
    team_run_id uuid REFERENCES public.team_runs(id) ON DELETE SET NULL,
    PRIMARY KEY(trigger_id,slot)
);
ALTER TABLE public.scheduled_firings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_firings FROM anon,authenticated;
GRANT ALL ON public.scheduled_firings TO service_role;
-- Both schedulers pass the last observed firing. Lock, compare, insert, and stamp
-- the firing in one transaction. A stale evaluator cannot create a second job.
CREATE FUNCTION public.enqueue_scheduled_firing(p_trigger_id uuid,p_observed_last_fired timestamptz,p_title text,p_description text)
RETURNS TABLE(task_id uuid,team_run_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_trigger public.agent_triggers%ROWTYPE; v_owner uuid; v_task uuid; v_run uuid; v_ws uuid; v_slot timestamptz:=date_trunc('minute',now());
BEGIN
    SELECT workspace_id INTO STRICT v_ws FROM public.agent_triggers WHERE id=p_trigger_id;
    PERFORM 1 FROM public.workspaces WHERE id=v_ws AND suspended_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT * INTO STRICT v_trigger FROM public.agent_triggers WHERE id=p_trigger_id FOR UPDATE;
    IF NOT v_trigger.enabled OR v_trigger.trigger_type<>'cron' OR v_trigger.last_fired_at IS DISTINCT FROM p_observed_last_fired
       OR v_trigger.last_fired_at>=v_slot THEN RETURN; END IF;
    SELECT owner_id INTO v_owner FROM public.workspaces WHERE id=v_ws;
    IF v_trigger.team_id IS NOT NULL THEN
        INSERT INTO public.team_runs(workspace_id,team_id,input_task,status,created_by,actor_type)
        VALUES(v_ws,v_trigger.team_id,p_title||E'\n\n'||p_description,'pending',v_owner,'system') RETURNING id INTO v_run;
    ELSIF v_trigger.agent_id IS NOT NULL THEN
        INSERT INTO public.tasks(workspace_id,title,description,assigned_agent_id,status,priority,created_by,actor_type,metadata)
        VALUES(v_ws,p_title,p_description,v_trigger.agent_id,'dispatched','medium',v_owner,'system',jsonb_build_object('source','cron_trigger','trigger_id',p_trigger_id)) RETURNING id INTO v_task;
    ELSE RAISE EXCEPTION 'Trigger requires an agent or team'; END IF;
    INSERT INTO public.scheduled_firings(trigger_id,slot,task_id,team_run_id) VALUES(p_trigger_id,v_slot,v_task,v_run);
    UPDATE public.agent_triggers SET last_fired_at=now() WHERE id=p_trigger_id;
    INSERT INTO public.trigger_log(trigger_id,task_id,status) VALUES(p_trigger_id,v_task,'fired');
    RETURN QUERY SELECT v_task,v_run;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_scheduled_firing(uuid,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_scheduled_firing(uuid,timestamptz,text,text) TO service_role;
