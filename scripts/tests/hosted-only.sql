-- SPDX-License-Identifier: MIT
-- Universal software access must not weaken server-owned hosting policy.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.must_reject(statement text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN insufficient_privilege OR raise_exception THEN RETURN;
 END;
 RAISE EXCEPTION 'Expected authorization rejection: %',statement;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.must_reject(text) TO authenticated,anon;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) VALUES
 ('71000000-0000-0000-0000-000000000001','owner@hosting.invalid'),
 ('71000000-0000-0000-0000-000000000002','foreign@hosting.invalid');
CREATE TEMP TABLE hosting_fixture AS SELECT id,owner_id FROM public.workspaces
 WHERE owner_id IN ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002');
GRANT SELECT ON hosting_fixture TO authenticated;
UPDATE public.workspaces SET plan='free',trial_expires_at=NULL,is_beta=false WHERE id IN(SELECT id FROM hosting_fixture);
DO $$ BEGIN
 IF public.features_for_plan('free') IS DISTINCT FROM public.features_for_plan('team')
 OR NOT public.features_for_plan('free') @> ARRAY['collaboration_mode','audit_logs','team_memory','rbac','swarm']::text[]
 THEN RAISE EXCEPTION 'Software features still require a paid plan'; END IF;
 IF cardinality(public.features_for_plan('unknown'))<>0 THEN RAISE EXCEPTION 'Unknown plan granted capabilities'; END IF;
 IF has_function_privilege('anon','public.get_deployment_policy()','EXECUTE') THEN RAISE EXCEPTION 'Anonymous policy access'; END IF;
END $$;
UPDATE public.deployment_policy SET hosted=true;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
DO $$ DECLARE ws uuid; BEGIN
 SELECT id INTO ws FROM hosting_fixture WHERE owner_id=auth.uid();
 IF public.get_deployment_policy()->>'hosted'<>'true' THEN RAISE EXCEPTION 'Incorrect hosting mode'; END IF;
 IF public.get_workspace_quota(ws,'agents')->>'limit'<>'3' THEN RAISE EXCEPTION 'Hosted allowance bypassed'; END IF;
 IF public.get_workspace_quota(ws,'csv_export')->>'allowed'<>'true' THEN RAISE EXCEPTION 'Export paywall remains'; END IF;
END $$;
SELECT pg_temp.must_reject('UPDATE public.deployment_policy SET hosted=false');
SELECT pg_temp.must_reject('SELECT public.get_workspace_quota(id,''agents'') FROM hosting_fixture WHERE owner_id<>auth.uid()');
RESET ROLE;
UPDATE public.deployment_policy SET hosted=false;
SET LOCAL ROLE authenticated;
DO $$ DECLARE ws uuid; BEGIN
 SELECT id INTO ws FROM hosting_fixture WHERE owner_id=auth.uid();
 IF public.get_deployment_policy()->>'hosted'<>'false' THEN RAISE EXCEPTION 'Self-host policy not returned'; END IF;
 IF public.get_workspace_quota(ws,'agents')->>'limit'<>'-1' THEN RAISE EXCEPTION 'Self-host resource paywall remains'; END IF;
 IF public.get_workspace_quota(ws,'csv_export')->>'allowed'<>'true' THEN RAISE EXCEPTION 'Self-host export paywall remains'; END IF;
END $$;
SELECT pg_temp.must_reject('SELECT public.get_workspace_quota(id,''agents'') FROM hosting_fixture WHERE owner_id<>auth.uid()');
ROLLBACK;
