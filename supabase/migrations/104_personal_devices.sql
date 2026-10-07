-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Personal devices have narrow grants, never a user JWT or service-role key.
CREATE TABLE public.personal_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80), runtime text NOT NULL CHECK(runtime IN('codex:cli','claude:cli','codex:acp','claude:acp','gemini:acp','copilot:acp')),
 agent_ids uuid[] NOT NULL CHECK(cardinality(agent_ids) BETWEEN 1 AND 25), credential_hash text UNIQUE,
 approved_until timestamptz NOT NULL DEFAULT now()+interval '30 days', revoked_at timestamptz,
 last_seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_personal_device ON public.personal_devices(user_id) WHERE revoked_at IS NULL;
CREATE TABLE public.device_pairings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
 proof_hash text NOT NULL, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80), runtime text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes', device_id uuid REFERENCES public.personal_devices(id) ON DELETE CASCADE,
 exchanged_at timestamptz, last_poll_at timestamptz
);
CREATE TABLE public.device_pairing_budgets (key_hash text PRIMARY KEY, window_at timestamptz NOT NULL DEFAULT now(), used integer NOT NULL DEFAULT 0);
ALTER TABLE public.personal_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_pairing_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personal_devices,public.device_pairings,public.device_pairing_budgets FROM anon,authenticated;
GRANT SELECT(id,user_id,workspace_id,name,runtime,agent_ids,approved_until,revoked_at,last_seen_at,created_at) ON public.personal_devices TO authenticated;
CREATE POLICY personal_device_read ON public.personal_devices FOR SELECT TO authenticated USING(user_id=auth.uid() AND public.is_workspace_member(workspace_id));
GRANT ALL ON public.personal_devices,public.device_pairings,public.device_pairing_budgets TO service_role;

CREATE FUNCTION public.start_device_pairing(p_proof_hash text,p_code text,p_name text,p_runtime text,p_client_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;v_count integer;
BEGIN
 IF p_proof_hash !~ '^[a-f0-9]{64}$' OR p_client_hash !~ '^[a-f0-9]{64}$' OR p_code !~ '^[A-Z2-9]{10}$' OR p_runtime NOT IN('codex:cli','claude:cli','codex:acp','claude:acp','gemini:acp','copilot:acp') THEN RAISE EXCEPTION 'Invalid pairing'; END IF;
 -- Both aggregate and gateway-identified budgets survive replicas.
 INSERT INTO public.device_pairing_budgets(key_hash) VALUES('global'),(p_client_hash) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM public.device_pairing_budgets WHERE key_hash IN('global',p_client_hash) ORDER BY key_hash FOR UPDATE;
 UPDATE public.device_pairing_budgets SET window_at=now(),used=0 WHERE key_hash IN('global',p_client_hash) AND window_at<now()-interval '1 minute';
 IF EXISTS(SELECT 1 FROM public.device_pairing_budgets WHERE key_hash='global' AND used>=100 OR key_hash=p_client_hash AND used>=5) THEN RAISE EXCEPTION 'Pairing rate limit'; END IF;
 UPDATE public.device_pairing_budgets SET used=used+1 WHERE key_hash IN('global',p_client_hash);
 INSERT INTO public.device_pairings(proof_hash,code,name,runtime) VALUES(p_proof_hash,p_code,p_name,p_runtime) RETURNING id INTO v_id;
 RETURN v_id;
END;
$$;

CREATE FUNCTION public.consume_pairing_review_budget() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_key text:='review:'||auth.uid()::text;v_used integer;
BEGIN
 INSERT INTO public.device_pairing_budgets(key_hash) VALUES(v_key) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM public.device_pairing_budgets WHERE key_hash=v_key FOR UPDATE;
 UPDATE public.device_pairing_budgets SET window_at=now(),used=0 WHERE key_hash=v_key AND window_at<now()-interval '1 minute';
 SELECT used INTO v_used FROM public.device_pairing_budgets WHERE key_hash=v_key;
 IF v_used>=10 THEN RETURN false; END IF;
 UPDATE public.device_pairing_budgets SET used=used+1 WHERE key_hash=v_key;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_pairing_review_budget() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.approve_device_pairing(p_code text,p_workspace_id uuid,p_agent_ids uuid[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.device_pairings;v_id uuid;
BEGIN
 IF auth.role()<>'authenticated' OR auth.uid() IS NULL OR NOT public.is_workspace_member(p_workspace_id) THEN RAISE EXCEPTION 'Sign in to the selected workspace'; END IF;
 IF NOT public.consume_pairing_review_budget() THEN RETURN NULL; END IF;
 IF cardinality(p_agent_ids) NOT BETWEEN 1 AND 25 OR cardinality(p_agent_ids) IS NULL THEN RAISE EXCEPTION 'Select permitted agents'; END IF;
 SELECT * INTO p FROM public.device_pairings WHERE code=upper(replace(p_code,'-','')) AND expires_at>now() FOR UPDATE;
 IF NOT FOUND OR p.device_id IS NOT NULL OR p.exchanged_at IS NOT NULL THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_agent_ids) a(id) WHERE NOT EXISTS(SELECT 1 FROM public.agents g WHERE g.id=a.id AND g.workspace_id=p_workspace_id AND g.config->'execution'->>'kind'='external' AND (g.config->'execution'->>'agent')||':'||(g.config->'execution'->>'transport')=p.runtime)) THEN RAISE EXCEPTION 'Agent runtime or workspace does not match'; END IF;
 INSERT INTO public.personal_devices(user_id,workspace_id,name,runtime,agent_ids) VALUES(auth.uid(),p_workspace_id,p.name,p.runtime,p_agent_ids) RETURNING id INTO v_id;
 UPDATE public.device_pairings SET device_id=v_id WHERE id=p.id;
 RETURN v_id;
END;
$$;

CREATE FUNCTION public.inspect_device_pairing(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.device_pairings;
BEGIN
 IF auth.role()<>'authenticated' OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to inspect a pairing'; END IF;
 IF NOT public.consume_pairing_review_budget() THEN RETURN NULL; END IF;
 SELECT * INTO p FROM public.device_pairings WHERE code=upper(replace(p_code,'-','')) AND expires_at>now() AND device_id IS NULL;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('name',p.name,'runtime',p.runtime,'expiresAt',p.expires_at);
END;
$$;

CREATE FUNCTION public.exchange_device_pairing(p_id uuid,p_proof_hash text,p_credential_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.device_pairings;d public.personal_devices;
BEGIN
 SELECT * INTO p FROM public.device_pairings WHERE id=p_id AND proof_hash=p_proof_hash AND expires_at>now() FOR UPDATE;
 IF NOT FOUND OR p.exchanged_at IS NOT NULL OR p_credential_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Pairing expired or reused'; END IF;
 IF p.last_poll_at>now()-interval '2 seconds' THEN RAISE EXCEPTION 'Poll no faster than every three seconds'; END IF;
 UPDATE public.device_pairings SET last_poll_at=now() WHERE id=p.id;
 IF p.device_id IS NULL THEN RETURN jsonb_build_object('pending',true); END IF;
 SELECT * INTO d FROM public.personal_devices WHERE id=p.device_id AND revoked_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Device revoked'; END IF;
 UPDATE public.personal_devices SET credential_hash=p_credential_hash WHERE id=d.id;
 UPDATE public.device_pairings SET exchanged_at=now() WHERE id=p.id;
 RETURN jsonb_build_object('deviceId',d.id,'workspaceId',d.workspace_id,'runtime',d.runtime,'expiresAt',d.approved_until);
END;
$$;

CREATE FUNCTION public.revoke_personal_device(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role()<>'authenticated' OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to revoke a device'; END IF;
 UPDATE public.personal_devices SET revoked_at=now(),credential_hash=NULL WHERE id=p_id AND user_id=auth.uid() AND public.is_workspace_member(workspace_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Device unavailable'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.start_device_pairing(text,text,text,text,text),public.exchange_device_pairing(uuid,text,text),public.approve_device_pairing(text,uuid,uuid[]),public.inspect_device_pairing(text),public.revoke_personal_device(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_device_pairing(text,text,text,text,text),public.exchange_device_pairing(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_device_pairing(text,uuid,uuid[]),public.inspect_device_pairing(text),public.revoke_personal_device(uuid) TO authenticated;
