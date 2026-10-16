-- SPDX-License-Identifier: MIT
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.expect_error(statement text,fragment text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE message text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT; END;
 IF message IS NULL OR position(fragment IN message)=0 THEN RAISE EXCEPTION 'Expected [%], got [%]',fragment,message; END IF;
END $$;
CREATE FUNCTION pg_temp.seed(w uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.seed_demo_workspace(w,
 '[{"name":"Research Analyst","system_prompt":"Use supplied evidence."},{"name":"Content Writer","system_prompt":"Preserve citations."},{"name":"Data Analyst","system_prompt":"Unknown metrics remain unknown."}]',
 '[{"agent_name":"Research Analyst","step_name":"Extract","instructions":"Cite notes","expected_output":"Evidence","on_failure":"stop"},{"agent_name":"Data Analyst","step_name":"Analyze","instructions":"Use evidence","expected_output":"Priorities","on_failure":"stop"},{"agent_name":"Content Writer","step_name":"Write","instructions":"Draft","expected_output":"Brief","on_failure":"stop"}]');
$$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text,text),pg_temp.seed(uuid) TO authenticated;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.deployment_policy SET hosted=true;
INSERT INTO auth.users(id,email) VALUES('74000000-0000-0000-0000-000000000001','demo-owner@fixture.invalid'),('74000000-0000-0000-0000-000000000002','demo-other@fixture.invalid');
UPDATE public.workspaces SET plan='free',trial_expires_at=NULL,is_beta=false WHERE owner_id IN('74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002');
CREATE TEMP TABLE fixture AS SELECT id AS workspace_id FROM public.workspaces WHERE owner_id='74000000-0000-0000-0000-000000000001';
GRANT SELECT ON fixture TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"74000000-0000-0000-0000-000000000001"}',true);
INSERT INTO public.agents(workspace_id,name,model,provider,system_prompt) SELECT workspace_id,'Keep customer agent','gpt-4o-mini','openai','Keep' FROM fixture;
SELECT pg_temp.expect_error('SELECT pg_temp.seed((SELECT workspace_id FROM fixture))','limit');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.agents WHERE workspace_id=(SELECT workspace_id FROM fixture))<>1 OR EXISTS(SELECT 1 FROM public.workspace_demo_seeds) THEN RAISE EXCEPTION 'Quota failure left partial agents or manifest'; END IF;
END $$;
DELETE FROM public.agents WHERE workspace_id=(SELECT workspace_id FROM fixture);
INSERT INTO public.teams(workspace_id,name,mode,config) SELECT workspace_id,'Keep customer team','pipeline','{}' FROM fixture;
SELECT pg_temp.expect_error('SELECT pg_temp.seed((SELECT workspace_id FROM fixture))','limit');
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.agents WHERE workspace_id=(SELECT workspace_id FROM fixture)) THEN RAISE EXCEPTION 'Late team quota failure left agents'; END IF; END $$;
DELETE FROM public.teams WHERE workspace_id=(SELECT workspace_id FROM fixture);
SELECT pg_temp.seed((SELECT workspace_id FROM fixture));
SELECT pg_temp.expect_error('SELECT pg_temp.seed((SELECT workspace_id FROM fixture))','already exists');
SELECT pg_temp.expect_error('UPDATE public.workspace_demo_seeds SET agent_ids=''{}''','permission denied');
SELECT pg_temp.expect_error('SELECT public.remove_demo_workspace((SELECT workspace_id FROM fixture),gen_random_uuid())','selection changed');
SELECT pg_temp.expect_error('SELECT public.clear_legacy_demo_marker((SELECT workspace_id FROM fixture))','Tracked demo exists');
SAVEPOINT edited;
UPDATE public.agents SET name='My customized analyst' WHERE id=(SELECT agent_ids[1] FROM public.workspace_demo_seeds);
SELECT pg_temp.expect_error('SELECT public.remove_demo_workspace((SELECT workspace_id FROM fixture),(SELECT seed_id FROM public.workspace_demo_seeds))','were edited');
DO $$ BEGIN IF (SELECT count(*) FROM public.agents WHERE workspace_id=(SELECT workspace_id FROM fixture))<>3 THEN RAISE EXCEPTION 'Edited demo was partially removed'; END IF; END $$;
ROLLBACK TO edited;
SAVEPOINT membership;
UPDATE public.team_members SET role='reviewer' WHERE team_id=(SELECT team_id FROM public.workspace_demo_seeds);
SELECT pg_temp.expect_error('SELECT public.remove_demo_workspace((SELECT workspace_id FROM fixture),(SELECT seed_id FROM public.workspace_demo_seeds))','were edited');
ROLLBACK TO membership;
SAVEPOINT active_run;
INSERT INTO public.team_runs(team_id,workspace_id,input_task,created_by,status) SELECT team_id,workspace_id,'Demo fixture',auth.uid(),'pending' FROM public.workspace_demo_seeds;
SELECT pg_temp.expect_error('SELECT public.remove_demo_workspace((SELECT workspace_id FROM fixture),(SELECT seed_id FROM public.workspace_demo_seeds))','Cancel active demo runs');
ROLLBACK TO active_run;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.workspaces SET plan='team' WHERE id=(SELECT workspace_id FROM fixture);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"74000000-0000-0000-0000-000000000001"}',true);
INSERT INTO public.agents(workspace_id,name,model,provider,system_prompt,tags) SELECT workspace_id,'My demo-tagged agent','gpt-4o-mini','openai','Keep',ARRAY['demo'] FROM fixture;
INSERT INTO public.teams(workspace_id,name,mode,config) SELECT workspace_id,'Unrelated team','pipeline','{}' FROM fixture;
SAVEPOINT reused;
INSERT INTO public.team_members(team_id,agent_id,role,position) SELECT t.id,m.agent_ids[1],'worker',0 FROM public.teams t CROSS JOIN public.workspace_demo_seeds m WHERE t.name='Unrelated team';
SELECT pg_temp.expect_error('SELECT public.remove_demo_workspace((SELECT workspace_id FROM fixture),(SELECT seed_id FROM public.workspace_demo_seeds))','used outside');
ROLLBACK TO reused;
UPDATE public.workspaces SET settings=jsonb_build_object('demo_seeded',true,'demo_team_id',(SELECT id FROM public.teams WHERE name='Unrelated team')) WHERE id=(SELECT workspace_id FROM fixture);
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"74000000-0000-0000-0000-000000000002"}',true);
SELECT pg_temp.expect_error('SELECT pg_temp.seed((SELECT workspace_id FROM fixture))','Not authorized');
SELECT pg_temp.expect_error('SELECT public.get_demo_workspace((SELECT workspace_id FROM fixture))','Forbidden');
SELECT pg_temp.expect_error('SELECT public.remove_demo_workspace((SELECT workspace_id FROM fixture),gen_random_uuid())','Not authorized');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"74000000-0000-0000-0000-000000000001"}',true);
SELECT public.remove_demo_workspace((SELECT workspace_id FROM fixture),(SELECT seed_id FROM public.workspace_demo_seeds));
DO $$ BEGIN
 IF (SELECT count(*) FROM public.agents WHERE workspace_id=(SELECT workspace_id FROM fixture))<>1 OR NOT EXISTS(SELECT 1 FROM public.agents WHERE name='My demo-tagged agent') OR NOT EXISTS(SELECT 1 FROM public.teams WHERE name='Unrelated team') THEN RAISE EXCEPTION 'Cleanup deleted resources selected by mutable tags/settings'; END IF;
END $$;
UPDATE public.workspaces SET settings=jsonb_build_object('demo_seeded',true,'demo_team_id',(SELECT id FROM public.teams WHERE name='Unrelated team')) WHERE id=(SELECT workspace_id FROM fixture);
SELECT pg_temp.expect_error('SELECT public.remove_demo_workspace((SELECT workspace_id FROM fixture),gen_random_uuid())','Legacy or missing');
SELECT public.clear_legacy_demo_marker((SELECT workspace_id FROM fixture));
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.teams WHERE name='Unrelated team') OR NOT EXISTS(SELECT 1 FROM public.agents WHERE name='My demo-tagged agent') THEN RAISE EXCEPTION 'Legacy cleanup deleted data'; END IF; END $$;
ROLLBACK;
