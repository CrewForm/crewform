-- SPDX-License-Identifier: MIT
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.expect_error(statement text,fragment text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE message text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT; END;
 IF message IS NULL OR position(fragment IN message)=0 THEN RAISE EXCEPTION 'Expected [%], got [%]',fragment,message; END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text,text) TO authenticated,service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) VALUES
 ('72000000-0000-0000-0000-000000000001','checkpoint-owner@fixture.invalid'),
 ('72000000-0000-0000-0000-000000000002','checkpoint-foreign@fixture.invalid');
INSERT INTO public.task_runners(id,instance_name) VALUES('72000000-0000-0000-0000-000000000003','checkpoint-fixture');
INSERT INTO public.agents(id,workspace_id,name,model,provider)
 SELECT '72000000-0000-0000-0000-000000000004',id,'Reviewer','fixture','openai' FROM public.workspaces WHERE owner_id='72000000-0000-0000-0000-000000000001';
INSERT INTO public.teams(id,workspace_id,name,mode,config)
 SELECT '72000000-0000-0000-0000-000000000005',id,'Checkpoint fixture','pipeline',
 '{"auto_handoff":false,"steps":[{"agent_id":"72000000-0000-0000-0000-000000000004","step_name":"Review"},{"agent_id":"72000000-0000-0000-0000-000000000004","step_name":"Critic"}]}'::jsonb
 FROM public.workspaces WHERE owner_id='72000000-0000-0000-0000-000000000001';
INSERT INTO public.team_runs(id,team_id,workspace_id,input_task,created_by,status,claimed_by_runner)
 SELECT '72000000-0000-0000-0000-000000000006','72000000-0000-0000-0000-000000000005',id,'Supplied fixture patch',owner_id,'running','72000000-0000-0000-0000-000000000003'
 FROM public.workspaces WHERE owner_id='72000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE checkpoint_attempt AS SELECT execution_attempt_id AS id FROM public.team_runs WHERE id='72000000-0000-0000-0000-000000000006';
GRANT SELECT ON checkpoint_attempt TO service_role;
SELECT set_config('request.headers',jsonb_build_object('x-crewform-runner-id','72000000-0000-0000-0000-000000000003',
 'x-crewform-execution-job','72000000-0000-0000-0000-000000000006','x-crewform-execution-attempt',(SELECT id FROM checkpoint_attempt))::text,true);
SET LOCAL ROLE service_role;
SELECT (public.open_pipeline_checkpoint('72000000-0000-0000-0000-000000000006',(SELECT id FROM checkpoint_attempt),'original file context','["original memory"]')).next_step;
SELECT (public.write_pipeline_step('72000000-0000-0000-0000-000000000006',(SELECT id FROM checkpoint_attempt),0,false)).in_flight;
SELECT (public.write_pipeline_step('72000000-0000-0000-0000-000000000006',(SELECT id FROM checkpoint_attempt),0,true,
 '{"output":"committed evidence","agentProvider":"openai","agentModel":"fixture","usage":{"totalTokens":5,"costEstimateUSD":0.01}}')).next_step;
SELECT public.pause_pipeline_boundary('72000000-0000-0000-0000-000000000006',(SELECT id FROM checkpoint_attempt));
RESET ROLE;
DO $$ BEGIN
 IF (SELECT tokens_total FROM public.team_runs WHERE id='72000000-0000-0000-0000-000000000006')<>5 THEN RAISE EXCEPTION 'Committed usage lost'; END IF;
 IF has_function_privilege('authenticated','public.write_pipeline_step(uuid,uuid,integer,boolean,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Browser can commit results'; END IF;
END $$;
SELECT set_config('request.headers','{}',true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72000000-0000-0000-0000-000000000002"}',true);
SELECT pg_temp.expect_error($q$SELECT public.continue_pipeline_run('72000000-0000-0000-0000-000000000006',4,NULL)$q$,'Not authorized');
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.pipeline_checkpoints) THEN RAISE EXCEPTION 'Foreign checkpoint exposed'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72000000-0000-0000-0000-000000000001"}',true);
SELECT pg_temp.expect_error($q$UPDATE public.pipeline_checkpoints SET next_step=99$q$,'permission denied');
SELECT pg_temp.expect_error($q$UPDATE public.team_runs SET status='pending' WHERE id='72000000-0000-0000-0000-000000000006'$q$,'server-owned');
SELECT pg_temp.expect_error($q$SELECT public.continue_pipeline_run('72000000-0000-0000-0000-000000000006',0,NULL)$q$,'stale');
SELECT pg_temp.expect_error($q$SELECT public.continue_pipeline_run('72000000-0000-0000-0000-000000000006',(SELECT revision FROM public.pipeline_checkpoints),NULL)$q$,'stale or expired');
RESET ROLE;
SAVEPOINT expiry;
UPDATE public.pipeline_checkpoints SET approval=jsonb_set(approval,'{expiresAt}',to_jsonb(now()-interval '1 hour'));
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT public.continue_pipeline_run('72000000-0000-0000-0000-000000000006',(SELECT revision FROM public.pipeline_checkpoints),(SELECT (approval->>'id')::uuid FROM public.pipeline_checkpoints))$q$,'expired');
ROLLBACK TO expiry;
SAVEPOINT cancellation;
SET LOCAL ROLE authenticated;
UPDATE public.team_runs SET status='cancelled' WHERE id='72000000-0000-0000-0000-000000000006';
SELECT pg_temp.expect_error($q$SELECT public.continue_pipeline_run('72000000-0000-0000-0000-000000000006',(SELECT revision FROM public.pipeline_checkpoints),NULL)$q$,'not awaiting');
ROLLBACK TO cancellation;
SET LOCAL ROLE authenticated;
SELECT public.continue_pipeline_run('72000000-0000-0000-0000-000000000006',(SELECT revision FROM public.pipeline_checkpoints),(SELECT (approval->>'id')::uuid FROM public.pipeline_checkpoints));
RESET ROLE;
DO $$ BEGIN
 IF (SELECT jsonb_array_length(decisions) FROM public.pipeline_checkpoints)<>1 THEN RAISE EXCEPTION 'Approval was not persisted'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.team_runs SET status='running',claimed_by_runner='72000000-0000-0000-0000-000000000003' WHERE id='72000000-0000-0000-0000-000000000006';
SELECT set_config('request.headers',jsonb_build_object('x-crewform-runner-id','72000000-0000-0000-0000-000000000003',
 'x-crewform-execution-job','72000000-0000-0000-0000-000000000006','x-crewform-execution-attempt',execution_attempt_id)::text,true)
 FROM public.team_runs WHERE id='72000000-0000-0000-0000-000000000006';
SELECT pg_temp.expect_error($q$SELECT public.write_pipeline_step('72000000-0000-0000-0000-000000000006',(SELECT id FROM checkpoint_attempt),1,false)$q$,'attempt lost');
UPDATE checkpoint_attempt SET id=(SELECT execution_attempt_id FROM public.team_runs WHERE id='72000000-0000-0000-0000-000000000006');
SAVEPOINT changed;
UPDATE public.agents SET system_prompt='changed' WHERE id='72000000-0000-0000-0000-000000000004';
SELECT pg_temp.expect_error($q$SELECT public.open_pipeline_checkpoint('72000000-0000-0000-0000-000000000006',(SELECT id FROM checkpoint_attempt),'','[]')$q$,'configuration changed');
ROLLBACK TO changed;
SET LOCAL ROLE service_role;
DO $$ DECLARE c public.pipeline_checkpoints; BEGIN
 c:=public.open_pipeline_checkpoint('72000000-0000-0000-0000-000000000006',(SELECT id FROM checkpoint_attempt),'replacement context','["replacement memory"]');
 IF c.next_step<>1 OR c.results->0->>'output'<>'committed evidence' OR c.file_context<>'original file context' OR c.memories<>'["original memory"]'::jsonb THEN RAISE EXCEPTION 'Restart lost committed evidence or context'; END IF;
END $$;
SELECT (public.write_pipeline_step('72000000-0000-0000-0000-000000000006',(SELECT id FROM checkpoint_attempt),1,false)).in_flight;
RESET ROLE;
UPDATE public.team_runs SET status='failed' WHERE id='72000000-0000-0000-0000-000000000006';
SELECT set_config('request.headers','{}',true);
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72000000-0000-0000-0000-000000000001"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT public.continue_pipeline_run('72000000-0000-0000-0000-000000000006',(SELECT revision FROM public.pipeline_checkpoints),NULL)$q$,'uncertain');
ROLLBACK;
