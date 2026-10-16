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
UPDATE public.deployment_policy SET hosted=true;
INSERT INTO auth.users(id,email) VALUES('73000000-0000-0000-0000-000000000001','pipeline-device@fixture.invalid');
UPDATE public.workspaces SET plan='free',trial_expires_at=NULL,is_beta=false WHERE owner_id='73000000-0000-0000-0000-000000000001';
INSERT INTO public.task_runners(id,instance_name) VALUES('73000000-0000-0000-0000-000000000002','personal-pipeline-fixture');
INSERT INTO public.agents(id,workspace_id,name,model,provider,system_prompt,config)
 SELECT '73000000-0000-0000-0000-000000000003',id,'First device reviewer','default','openai','Fixture only',
 '{"execution":{"kind":"external","agent":"codex","transport":"cli"},"paired_device_id":"73000000-0000-0000-0000-000000000005"}'::jsonb
 FROM public.workspaces WHERE owner_id='73000000-0000-0000-0000-000000000001';
INSERT INTO public.agents(id,workspace_id,name,model,provider,system_prompt,config)
 SELECT '73000000-0000-0000-0000-000000000004',id,'Second device critic','default','openai','Fixture only',
 '{"execution":{"kind":"external","agent":"codex","transport":"cli"},"paired_device_id":"73000000-0000-0000-0000-000000000006"}'::jsonb
 FROM public.workspaces WHERE owner_id='73000000-0000-0000-0000-000000000001';
INSERT INTO public.personal_devices(id,workspace_id,user_id,name,runtime,credential_hash,agent_ids,approved_until)
 SELECT '73000000-0000-0000-0000-000000000005',id,owner_id,'First device','codex:cli',repeat('a',64),ARRAY['73000000-0000-0000-0000-000000000003'::uuid],now()+interval '1 day'
 FROM public.workspaces WHERE owner_id='73000000-0000-0000-0000-000000000001';
INSERT INTO public.personal_devices(id,workspace_id,user_id,name,runtime,credential_hash,agent_ids,approved_until)
 SELECT '73000000-0000-0000-0000-000000000006',id,owner_id,'Second device','codex:cli',repeat('b',64),ARRAY['73000000-0000-0000-0000-000000000004'::uuid],now()+interval '1 day'
 FROM public.workspaces WHERE owner_id='73000000-0000-0000-0000-000000000001';
SAVEPOINT profile_limit;
INSERT INTO public.personal_devices(workspace_id,user_id,name,runtime,agent_ids,approved_until)
 SELECT w.id,w.owner_id,'Extra fixture '||n,'codex:cli',ARRAY['73000000-0000-0000-0000-000000000003'::uuid],now()+interval '1 day'
 FROM public.workspaces w CROSS JOIN generate_series(1,4) n WHERE w.owner_id='73000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_error($q$INSERT INTO public.personal_devices(workspace_id,user_id,name,runtime,agent_ids)
 SELECT id,owner_id,'Seventh profile','codex:cli',ARRAY['73000000-0000-0000-0000-000000000003'::uuid] FROM public.workspaces WHERE owner_id='73000000-0000-0000-0000-000000000001'$q$,'more than six');
ROLLBACK TO profile_limit;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"73000000-0000-0000-0000-000000000001"}',true);
INSERT INTO public.teams(id,workspace_id,name,mode,config)
 SELECT '73000000-0000-0000-0000-000000000007',id,'Two approved devices','pipeline',
 '{"auto_handoff":false,"steps":[{"agent_id":"73000000-0000-0000-0000-000000000003","step_name":"Review"},{"agent_id":"73000000-0000-0000-0000-000000000004","step_name":"Critic"}]}'::jsonb
 FROM public.workspaces WHERE owner_id=auth.uid();
INSERT INTO public.team_runs(id,team_id,workspace_id,input_task,created_by,status)
 SELECT '73000000-0000-0000-0000-000000000008','73000000-0000-0000-0000-000000000007',id,'Supplied patch',auth.uid(),'pending' FROM public.workspaces WHERE owner_id=auth.uid();
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT id FROM public.claim_next_team_run('73000000-0000-0000-0000-000000000002');
CREATE TEMP TABLE pipeline_attempt AS SELECT execution_attempt_id AS id FROM public.team_runs WHERE id='73000000-0000-0000-0000-000000000008';
CREATE TEMP TABLE pipeline_job(data jsonb);
GRANT ALL ON pipeline_attempt,pipeline_job TO service_role;
SELECT set_config('request.headers',jsonb_build_object('x-crewform-runner-id','73000000-0000-0000-0000-000000000002','x-crewform-execution-job','73000000-0000-0000-0000-000000000008','x-crewform-execution-attempt',(SELECT id FROM pipeline_attempt))::text,true);
SET LOCAL ROLE service_role;
SELECT (public.open_pipeline_checkpoint('73000000-0000-0000-0000-000000000008',(SELECT id FROM pipeline_attempt),'','[]')).next_step;
SELECT (public.write_pipeline_step('73000000-0000-0000-0000-000000000008',(SELECT id FROM pipeline_attempt),0,false)).in_flight;
SELECT public.queue_personal_pipeline_job('73000000-0000-0000-0000-000000000008',(SELECT id FROM pipeline_attempt),0,'73000000-0000-0000-0000-000000000003','Supplied patch and original context','Fixture only');
SELECT public.queue_personal_pipeline_job('73000000-0000-0000-0000-000000000008',(SELECT id FROM pipeline_attempt),0,'73000000-0000-0000-0000-000000000003','Supplied patch and original context','Fixture only');
SELECT pg_temp.expect_error($q$SELECT public.queue_personal_pipeline_job('73000000-0000-0000-0000-000000000008',(SELECT id FROM pipeline_attempt),0,'73000000-0000-0000-0000-000000000004','wrong agent','Fixture only')$q$,'sequential steps');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.personal_pipeline_jobs)<>1 THEN RAISE EXCEPTION 'Queue acknowledgement repeated the job'; END IF;
 IF public.claim_personal_job(repeat('b',64)) IS NOT NULL THEN RAISE EXCEPTION 'Wrong device claimed a step'; END IF;
END $$;
INSERT INTO pipeline_job SELECT public.claim_personal_job(repeat('a',64));
DO $$ BEGIN
 IF (SELECT data->>'prompt' FROM pipeline_job)<>'Supplied patch and original context' THEN RAISE EXCEPTION 'Input was rewritten'; END IF;
 IF public.claim_personal_job(repeat('a',64)) IS NOT NULL THEN RAISE EXCEPTION 'Personal account claimed concurrent work'; END IF;
 IF (SELECT count(*) FROM public.execution_usage WHERE workspace_id=(SELECT workspace_id FROM public.team_runs WHERE id='73000000-0000-0000-0000-000000000008'))<>1 THEN RAISE EXCEPTION 'Step consumed a second hosted run reservation'; END IF;
END $$;
SELECT pg_temp.expect_error($q$SELECT public.heartbeat_personal_job(repeat('b',64),(SELECT (data->>'id')::uuid FROM pipeline_job),(SELECT (data->>'attemptId')::uuid FROM pipeline_job))$q$,'cancelled, expired or superseded');
SELECT pg_temp.expect_error($q$SELECT public.write_personal_job(repeat('a',64),(SELECT (data->>'id')::uuid FROM pipeline_job),gen_random_uuid(),1,'wrong attempt','completed')$q$,'cancelled, expired or superseded');
SELECT pg_temp.expect_error($q$SELECT public.write_personal_job(repeat('a',64),(SELECT (data->>'id')::uuid FROM pipeline_job),(SELECT (data->>'attemptId')::uuid FROM pipeline_job),2,'gap','stream')$q$,'sequence gap');
SELECT public.write_personal_job(repeat('a',64),(SELECT (data->>'id')::uuid FROM pipeline_job),(SELECT (data->>'attemptId')::uuid FROM pipeline_job),1,'partial','stream');
SELECT public.write_personal_job(repeat('a',64),(SELECT (data->>'id')::uuid FROM pipeline_job),(SELECT (data->>'attemptId')::uuid FROM pipeline_job),2,'committed device evidence','completed');
SELECT public.write_personal_job(repeat('a',64),(SELECT (data->>'id')::uuid FROM pipeline_job),(SELECT (data->>'attemptId')::uuid FROM pipeline_job),2,'committed device evidence','completed');
SELECT (public.write_pipeline_step('73000000-0000-0000-0000-000000000008',(SELECT id FROM pipeline_attempt),0,true,'{"output":"committed device evidence","usage":{"totalTokens":0,"costEstimateUSD":0,"usageKnown":false},"agentProvider":"native-codex","agentModel":"default"}')).next_step;
-- An exact terminal acknowledgement remains idempotent after the parent advances.
SELECT public.write_personal_job(repeat('a',64),(SELECT (data->>'id')::uuid FROM pipeline_job),(SELECT (data->>'attemptId')::uuid FROM pipeline_job),2,'committed device evidence','completed');
SELECT pg_temp.expect_error($q$SELECT public.heartbeat_personal_job(repeat('a',64),(SELECT (data->>'id')::uuid FROM pipeline_job),(SELECT (data->>'attemptId')::uuid FROM pipeline_job))$q$,'cancelled, expired or superseded');
SELECT public.pause_pipeline_boundary('73000000-0000-0000-0000-000000000008',(SELECT id FROM pipeline_attempt));
RESET ROLE;
SELECT set_config('request.headers','{}',true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"73000000-0000-0000-0000-000000000001"}',true);
SELECT pg_temp.expect_error('UPDATE public.personal_pipeline_jobs SET status=''completed''','permission denied');
DO $$ BEGIN IF has_function_privilege('authenticated','public.queue_personal_pipeline_job(uuid,uuid,integer,uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Browser can queue arbitrary device prompts'; END IF; END $$;
SELECT public.continue_pipeline_run('73000000-0000-0000-0000-000000000008',(SELECT revision FROM public.pipeline_checkpoints),(SELECT (approval->>'id')::uuid FROM public.pipeline_checkpoints));
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT id FROM public.claim_next_team_run('73000000-0000-0000-0000-000000000002');
UPDATE pipeline_attempt SET id=(SELECT execution_attempt_id FROM public.team_runs WHERE id='73000000-0000-0000-0000-000000000008');
SELECT set_config('request.headers',jsonb_build_object('x-crewform-runner-id','73000000-0000-0000-0000-000000000002','x-crewform-execution-job','73000000-0000-0000-0000-000000000008','x-crewform-execution-attempt',(SELECT id FROM pipeline_attempt))::text,true);
SELECT (public.open_pipeline_checkpoint('73000000-0000-0000-0000-000000000008',(SELECT id FROM pipeline_attempt),'replacement','[]')).next_step;
SELECT (public.write_pipeline_step('73000000-0000-0000-0000-000000000008',(SELECT id FROM pipeline_attempt),1,false)).in_flight;
SELECT public.queue_personal_pipeline_job('73000000-0000-0000-0000-000000000008',(SELECT id FROM pipeline_attempt),1,'73000000-0000-0000-0000-000000000004','Supplied patch plus committed device evidence','Fixture only');
SAVEPOINT queued;
UPDATE public.personal_devices SET revoked_at=now() WHERE id='73000000-0000-0000-0000-000000000006';
SELECT public.read_personal_pipeline_job('73000000-0000-0000-0000-000000000008',(SELECT id FROM pipeline_attempt),(SELECT id FROM public.personal_pipeline_jobs WHERE step_idx=1));
SELECT public.cancel_personal_pipeline_job('73000000-0000-0000-0000-000000000008',(SELECT id FROM pipeline_attempt),1);
DO $$ BEGIN IF (SELECT in_flight FROM public.pipeline_checkpoints) IS NOT NULL THEN RAISE EXCEPTION 'Never-issued job prevented safe boundary continuation'; END IF; END $$;
ROLLBACK TO queued;
DELETE FROM pipeline_job;
INSERT INTO pipeline_job SELECT public.claim_personal_job(repeat('b',64));
SAVEPOINT running;
SAVEPOINT suspended;
UPDATE public.workspaces SET suspended_at=now() WHERE owner_id='73000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_error($q$SELECT public.heartbeat_personal_job(repeat('b',64),(SELECT (data->>'id')::uuid FROM pipeline_job),(SELECT (data->>'attemptId')::uuid FROM pipeline_job))$q$,'authority expired or revoked');
ROLLBACK TO suspended;
UPDATE public.personal_pipeline_jobs SET lease_until=now()-interval '1 second' WHERE step_idx=1;
SELECT public.maintain_personal_jobs();
DO $$ BEGIN IF (SELECT status FROM public.personal_pipeline_jobs WHERE step_idx=1)<>'uncertain' THEN RAISE EXCEPTION 'Expired lease was replayable'; END IF; END $$;
ROLLBACK TO running;
UPDATE public.team_runs SET status='cancelled' WHERE id='73000000-0000-0000-0000-000000000008';
SELECT pg_temp.expect_error($q$SELECT public.heartbeat_personal_job(repeat('b',64),(SELECT (data->>'id')::uuid FROM pipeline_job),(SELECT (data->>'attemptId')::uuid FROM pipeline_job))$q$,'cancelled, expired or superseded');
SELECT pg_temp.expect_error($q$SELECT public.write_personal_job(repeat('b',64),(SELECT (data->>'id')::uuid FROM pipeline_job),(SELECT (data->>'attemptId')::uuid FROM pipeline_job),1,'late result','completed')$q$,'cancelled, expired or superseded');
SELECT public.cancel_personal_pipeline_job('73000000-0000-0000-0000-000000000008',(SELECT id FROM pipeline_attempt),1);
DO $$ BEGIN
 IF (SELECT status FROM public.personal_pipeline_jobs WHERE step_idx=1)<>'uncertain' OR (SELECT in_flight FROM public.pipeline_checkpoints) IS NULL THEN RAISE EXCEPTION 'Issued personal job lost uncertainty fence'; END IF;
END $$;
ROLLBACK;
