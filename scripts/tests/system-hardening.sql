-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Isolated regression fixtures. All rows/config changes are rolled back.
\set ON_ERROR_STOP on
BEGIN;
UPDATE public.deployment_policy SET hosted=true;
CREATE FUNCTION pg_temp.expect_error(statement text, fragment text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE message text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT; END;
  IF message IS NULL OR position(fragment IN message)=0 THEN RAISE EXCEPTION 'Expected rejection [%], got [%]',fragment,message; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text,text) TO authenticated,anon;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) VALUES('10000000-0000-0000-0000-000000000001','owner@hardening.invalid'),('10000000-0000-0000-0000-000000000002','member@hardening.invalid');
CREATE TEMP TABLE fixture AS SELECT id AS workspace_id,owner_id FROM public.workspaces WHERE owner_id IN ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
GRANT SELECT ON fixture TO authenticated,anon;
UPDATE public.workspaces SET plan='team',is_beta=false,trial_expires_at=NULL WHERE id IN(SELECT workspace_id FROM fixture);
INSERT INTO public.workspace_members(workspace_id,user_id,role) SELECT workspace_id,'10000000-0000-0000-0000-000000000002','member' FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
INSERT INTO public.agents(id,workspace_id,name,model,provider) SELECT '20000000-0000-0000-0000-000000000001',workspace_id,'Fixture','default','openai' FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
INSERT INTO public.teams(id,workspace_id,name) SELECT '20000000-0000-0000-0000-000000000002',workspace_id,'Fixture team' FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SELECT pg_temp.expect_error($q$UPDATE public.workspaces SET plan='enterprise' WHERE owner_id=auth.uid()$q$,'permission denied');
SELECT pg_temp.expect_error($q$UPDATE public.workspaces SET is_beta=true,trial_expires_at=now()+interval '100 years' WHERE owner_id=auth.uid()$q$,'permission denied');
INSERT INTO public.workspaces(name,slug,owner_id,plan,is_beta,trial_expires_at) VALUES('Forged entitlement','hardening-forged-entitlement',auth.uid(),'enterprise',true,now()+interval '100 years');
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.workspaces WHERE slug='hardening-forged-entitlement' AND (plan<>'free' OR is_beta OR trial_expires_at>now()+interval '8 days')) THEN RAISE EXCEPTION 'Workspace INSERT granted forged entitlements'; END IF; END $$;
INSERT INTO public.tasks(id,workspace_id,title,assigned_agent_id,status,created_by,actor_type,actor_id) SELECT '30000000-0000-0000-0000-000000000001',workspace_id,'Fixture','20000000-0000-0000-0000-000000000001','dispatched',owner_id,'api_key','forged' FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF (SELECT actor_type<>'user' OR actor_id<>created_by::text FROM public.tasks WHERE id='30000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Actor spoofed'; END IF;
 IF EXISTS(SELECT 1 FROM public.workspaces WHERE owner_id='10000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'Cross workspace read'; END IF;
END $$;
SELECT pg_temp.expect_error($q$UPDATE public.tasks SET created_by='10000000-0000-0000-0000-000000000002' WHERE id='30000000-0000-0000-0000-000000000001'$q$,'immutable');
SELECT pg_temp.expect_error($q$UPDATE public.tasks SET status='completed' WHERE id='30000000-0000-0000-0000-000000000001'$q$,'server-owned');
SELECT pg_temp.expect_error($q$SELECT public.reserve_chat_request('00000000-0000-0000-0000-000000000001')$q$,'permission denied');
SELECT pg_temp.expect_error($q$UPDATE public.deployment_policy SET hosted=false$q$,'permission denied');
SELECT pg_temp.expect_error($q$INSERT INTO public.tasks(workspace_id,title,assigned_agent_id,created_by) SELECT workspace_id,'spoof','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002' FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001'$q$,'initiator');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.plan_limits SET max_value=1 WHERE plan='team' AND resource='tasks_per_month';
SELECT pg_temp.expect_error($q$INSERT INTO public.team_runs(workspace_id,team_id,input_task,created_by) SELECT workspace_id,'20000000-0000-0000-0000-000000000002','over quota',owner_id FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001'$q$,'Monthly workflow');
UPDATE public.tasks SET status='cancelled' WHERE id='30000000-0000-0000-0000-000000000001';
INSERT INTO public.team_runs(id,workspace_id,team_id,input_task,created_by) SELECT '30000000-0000-0000-0000-000000000002',workspace_id,'20000000-0000-0000-0000-000000000002','released allowance',owner_id FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
UPDATE public.team_runs SET status='running' WHERE id='30000000-0000-0000-0000-000000000002';
UPDATE public.team_runs SET status='pending' WHERE id='30000000-0000-0000-0000-000000000002';
DO $$ BEGIN IF (SELECT count(*) FROM public.execution_usage WHERE state<>'released' AND workspace_id=(SELECT workspace_id FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001'))<>1 THEN RAISE EXCEPTION 'Retry charged twice'; END IF; END $$;
UPDATE public.deployment_policy SET hosted=false;
INSERT INTO public.tasks(workspace_id,title,created_by,status) SELECT workspace_id,'CE uncapped',owner_id,'dispatched' FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
UPDATE public.deployment_policy SET hosted=true;
UPDATE public.plan_limits SET max_value=10000 WHERE plan='team' AND resource='tasks_per_month';
INSERT INTO public.chat_widget_configs(id,workspace_id,agent_id,api_key,rate_limit_per_hour) SELECT '40000000-0000-0000-0000-000000000001',workspace_id,'20000000-0000-0000-0000-000000000001','fixture-only',2 FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF NOT public.reserve_chat_request('40000000-0000-0000-0000-000000000001') OR NOT public.reserve_chat_request('40000000-0000-0000-0000-000000000001') OR public.reserve_chat_request('40000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Aggregate widget limit failed'; END IF;
END $$;
INSERT INTO public.agent_triggers(id,agent_id,workspace_id,trigger_type,cron_expression,task_title_template) SELECT '40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',workspace_id,'cron','* * * * *','Fixture' FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
SELECT * FROM public.enqueue_scheduled_firing('40000000-0000-0000-0000-000000000002',NULL,'Fixture','');
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.enqueue_scheduled_firing('40000000-0000-0000-0000-000000000002',NULL,'Replay','')) THEN RAISE EXCEPTION 'Schedule duplicated'; END IF; END $$;
DO $$ DECLARE ws uuid; outcome text; BEGIN
 SELECT workspace_id INTO ws FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
 outcome:=public.apply_stripe_entitlement('fixture-event-1',10,ws,'cus_fixture','sub_fixture','pro','active',now(),now()+interval '1 month',false,true);
 IF outcome<>'applied' THEN RAISE EXCEPTION 'Billing failed'; END IF;
 outcome:=public.apply_stripe_entitlement('fixture-event-1',10,ws,'cus_fixture','sub_fixture','pro','active',now(),now()+interval '1 month',false,true);
 IF outcome<>'duplicate' THEN RAISE EXCEPTION 'Billing replay accepted'; END IF;
 outcome:=public.apply_stripe_entitlement('fixture-event-2',11,ws,'cus_fixture','sub_fixture','pro','active',now(),now()+interval '2 months',false,false);
 IF NOT EXISTS(SELECT 1 FROM public.ee_licenses WHERE workspace_id=ws AND valid_until>now()+interval '1 month') THEN RAISE EXCEPTION 'Renewal did not refresh licence'; END IF;
 outcome:=public.apply_stripe_entitlement('fixture-event-old',9,ws,'cus_fixture','sub_fixture','free','cancelled',NULL,NULL,false,false);
 IF outcome<>'stale' OR (SELECT plan FROM public.workspaces WHERE id=ws)<>'pro' THEN RAISE EXCEPTION 'Old deletion revoked new entitlement'; END IF;
END $$;
-- Native consent is captured by the real initiating session, not a service key.
UPDATE public.agents SET config='{"execution":{"kind":"external","agent":"codex","transport":"cli"}}' WHERE id='20000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
INSERT INTO public.tasks(id,workspace_id,title,assigned_agent_id,status,created_by) SELECT '50000000-0000-0000-0000-000000000001',workspace_id,'Native consent','20000000-0000-0000-0000-000000000001','pending',owner_id FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO storage.objects(bucket_id,name) SELECT 'attachments',workspace_id::text||'/50000000-0000-0000-0000-000000000001/input/fixture.txt' FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
INSERT INTO public.file_attachments(workspace_id,task_id,direction,file_name,file_type,file_size,storage_path) SELECT workspace_id,'50000000-0000-0000-0000-000000000001','input','fixture.txt','text/plain',1,workspace_id::text||'/50000000-0000-0000-0000-000000000001/input/fixture.txt' FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
UPDATE public.tasks SET status='dispatched' WHERE id='50000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_error($q$INSERT INTO public.file_attachments(workspace_id,task_id,direction,file_name,file_type,file_size,storage_path) SELECT workspace_id,'50000000-0000-0000-0000-000000000001','input','bad','text/plain',1,'foreign/path' FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001'$q$,'path');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.tasks SET status='running' WHERE id='50000000-0000-0000-0000-000000000001';
DO $$ DECLARE ws uuid; BEGIN
 SELECT workspace_id INTO ws FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
 IF NOT public.verify_native_consent(ws,'10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',NULL,'20000000-0000-0000-0000-000000000001',(SELECT to_jsonb(a) FROM public.agents a WHERE id='20000000-0000-0000-0000-000000000001')) THEN RAISE EXCEPTION 'Own native approval rejected'; END IF;
 UPDATE storage.objects SET version='fixture-replaced' WHERE name=ws::text||'/50000000-0000-0000-0000-000000000001/input/fixture.txt';
 IF public.verify_native_consent(ws,'10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',NULL,'20000000-0000-0000-0000-000000000001',(SELECT to_jsonb(a) FROM public.agents a WHERE id='20000000-0000-0000-0000-000000000001')) THEN RAISE EXCEPTION 'Changed file retained native approval'; END IF;
 UPDATE storage.objects SET version=NULL WHERE name=ws::text||'/50000000-0000-0000-0000-000000000001/input/fixture.txt';
 PERFORM pg_temp.expect_error($q$UPDATE public.agents SET system_prompt='Collaborator changed instructions' WHERE id='20000000-0000-0000-0000-000000000001'$q$,'Cancel active native');
 IF public.verify_native_consent(ws,'10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',NULL,'20000000-0000-0000-0000-000000000001',(SELECT to_jsonb(a)||'{"system_prompt":"Stale loaded snapshot"}'::jsonb FROM public.agents a WHERE id='20000000-0000-0000-0000-000000000001')) THEN RAISE EXCEPTION 'Changed native instructions retained consent'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SELECT pg_temp.expect_error($q$UPDATE public.tasks SET description='changed during execution' WHERE id='50000000-0000-0000-0000-000000000001'$q$,'server-owned');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.tasks SET status='waiting_for_input',interaction_context=jsonb_build_object('interactionId','60000000-0000-0000-0000-000000000001','requestedAt',(extract(epoch FROM now())*1000)::bigint,'timeoutMs',300000) WHERE id='50000000-0000-0000-0000-000000000001';
DO $$ DECLARE ws uuid; BEGIN
 SELECT workspace_id INTO ws FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
 PERFORM public.submit_interaction_response(ws,'20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','{"interactionId":"60000000-0000-0000-0000-000000000001","approved":true}');
 PERFORM public.submit_interaction_response(ws,'20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','{"interactionId":"60000000-0000-0000-0000-000000000001","approved":false}');
 IF (SELECT count(*) FROM public.interaction_responses WHERE task_id='50000000-0000-0000-0000-000000000001')<>1 THEN RAISE EXCEPTION 'Reply replay mutated saved decision'; END IF;
END $$;
SELECT pg_temp.expect_error($q$SELECT public.submit_interaction_response((SELECT workspace_id FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001'),'20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','{"interactionId":"60000000-0000-0000-0000-000000000002"}')$q$,'stale');
UPDATE public.tasks SET status='cancelled' WHERE id='50000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_error($q$SELECT public.submit_interaction_response((SELECT workspace_id FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001'),'20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','{"interactionId":"60000000-0000-0000-0000-000000000001"}')$q$,'stale');
-- Terminal status and delivery are one transaction; ambiguous writes need consent.
INSERT INTO public.output_routes(id,workspace_id,name,destination_type) SELECT '70000000-0000-0000-0000-000000000001',workspace_id,'Fixture','http' FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
UPDATE public.agents SET output_route_ids=ARRAY['70000000-0000-0000-0000-000000000001'::uuid] WHERE id='20000000-0000-0000-0000-000000000001';
UPDATE public.tasks SET status='failed',error='Fixture only' WHERE id='50000000-0000-0000-0000-000000000001';
DO $$ DECLARE delivery uuid;BEGIN
 SELECT id INTO STRICT delivery FROM public.output_delivery_queue WHERE job_id='50000000-0000-0000-0000-000000000001' AND event='task.failed';
 UPDATE public.output_delivery_queue SET state='delivering',lease_until=now()-interval '1 second' WHERE id=delivery;
 PERFORM public.claim_output_deliveries();
 IF (SELECT state FROM public.output_delivery_queue WHERE id=delivery)<>'uncertain' THEN RAISE EXCEPTION 'Interrupted delivery repeated'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.retry_output_delivery(%L,false)',delivery),'acknowledge duplicate');
 PERFORM public.retry_output_delivery(delivery,true);
 IF (SELECT state FROM public.output_delivery_queue WHERE id=delivery)<>'pending' THEN RAISE EXCEPTION 'Explicit recovery failed'; END IF;
END $$;
DO $$ DECLARE ws uuid;reserved public.billing_checkout_requests;BEGIN
 SELECT workspace_id INTO ws FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
 SELECT * INTO STRICT reserved FROM public.reserve_billing_checkout(ws,'pro');
 PERFORM pg_temp.expect_error(format('SELECT * FROM public.reserve_billing_checkout(%L,%L)',ws,'team'),'another plan');
 PERFORM public.bind_billing_checkout(ws,reserved.token,'cs_fixture','https://checkout.stripe.com/fixture',now()+interval '30 minutes');
 IF (SELECT token FROM public.reserve_billing_checkout(ws,'pro'))<>reserved.token THEN RAISE EXCEPTION 'Duplicate checkout created'; END IF;
END $$;

-- Delinquency has one seven-day deadline and must revoke hosted allowances.
DO $$ DECLARE ws uuid;quota jsonb;BEGIN
 SELECT workspace_id INTO ws FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
 UPDATE public.workspaces SET plan='team' WHERE id=ws;
 INSERT INTO public.workspace_entitlement_overrides VALUES(ws,'tasks_per_month',-1) ON CONFLICT(workspace_id,resource) DO UPDATE SET max_value=-1;
 UPDATE public.subscriptions SET plan='team',status='past_due' WHERE workspace_id=ws;
 IF NOT EXISTS(SELECT 1 FROM public.ee_licenses WHERE workspace_id=ws AND valid_until BETWEEN now()+interval '6 days' AND now()+interval '8 days' AND status='active') THEN RAISE EXCEPTION 'Grace anchored to next billing period'; END IF;
 UPDATE public.subscriptions SET past_due_since=now()-interval '8 days' WHERE workspace_id=ws;
 quota:=public.get_workspace_quota(ws,'tasks_per_month');
 IF public.effective_workspace_plan(ws)<>'free' OR quota->>'limit'<>'50' THEN RAISE EXCEPTION 'Delinquent legacy customer kept paid allowance'; END IF;
 UPDATE public.subscriptions SET status='active' WHERE workspace_id=ws;
 IF public.effective_workspace_plan(ws)<>'team' OR (public.get_workspace_quota(ws,'tasks_per_month')->>'limit')<>'-1' THEN RAISE EXCEPTION 'Recovery lost purchased entitlement'; END IF;
END $$;

-- Real claim headers must work, and a previous attempt on that runner must fail.
INSERT INTO public.task_runners(id,instance_name) VALUES('80000000-0000-0000-0000-000000000001','Fixture worker');
INSERT INTO public.tasks(id,workspace_id,title,priority,status,assigned_agent_id,created_by) SELECT '80000000-0000-0000-0000-000000000002',workspace_id,'Attempt fencing','high','dispatched','20000000-0000-0000-0000-000000000001',owner_id FROM fixture WHERE owner_id='10000000-0000-0000-0000-000000000001';
SELECT set_config('request.headers','{"x-crewform-runner-id":"80000000-0000-0000-0000-000000000001"}',true);
DO $$ DECLARE claimed uuid;old_attempt uuid;new_attempt uuid;BEGIN
 SELECT id INTO STRICT claimed FROM public.claim_next_task('80000000-0000-0000-0000-000000000001');
 IF claimed<>'80000000-0000-0000-0000-000000000002'::uuid THEN RAISE EXCEPTION 'Real runner claim failed'; END IF;
 SELECT execution_attempt_id INTO old_attempt FROM public.tasks WHERE id=claimed;
 UPDATE public.tasks SET status='pending' WHERE id=claimed;
 UPDATE public.tasks SET status='dispatched' WHERE id=claimed;
 PERFORM public.claim_next_task('80000000-0000-0000-0000-000000000001');
 SELECT execution_attempt_id INTO new_attempt FROM public.tasks WHERE id=claimed;
 IF old_attempt IS NOT DISTINCT FROM new_attempt THEN RAISE EXCEPTION 'Attempt reused'; END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-crewform-runner-id','80000000-0000-0000-0000-000000000001','x-crewform-execution-job',claimed,'x-crewform-execution-attempt',old_attempt)::text,true);
 PERFORM pg_temp.expect_error(format('UPDATE public.tasks SET result=%L WHERE id=%L','"stale output"',claimed),'Stale execution attempt');
 PERFORM set_config('request.headers',jsonb_build_object('x-crewform-runner-id','80000000-0000-0000-0000-000000000001','x-crewform-execution-job',claimed,'x-crewform-execution-attempt',new_attempt)::text,true);
 UPDATE public.tasks SET status='completed' WHERE id=claimed;
 PERFORM pg_temp.expect_error(format('UPDATE public.tasks SET status=%L WHERE id=%L','dispatched',claimed),'new run');
END $$;
SELECT set_config('request.headers','{}',true);

SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('SELECT * FROM public.execution_usage','permission denied');
SELECT pg_temp.expect_error('SELECT * FROM public.stripe_event_receipts','permission denied');
RESET ROLE;
-- Account/workspace deletion must complete its attachment foreign-key cascades.
-- Production's dump creates creator SET NULL before the parent CASCADE FKs.
-- Exercise that order too: the missing-parent update must be skipped entirely.
ALTER TABLE public.file_attachments DROP CONSTRAINT file_attachments_created_by_fkey,
 DROP CONSTRAINT file_attachments_task_id_fkey, DROP CONSTRAINT file_attachments_team_run_id_fkey;
ALTER TABLE public.file_attachments ADD CONSTRAINT file_attachments_created_by_fkey
 FOREIGN KEY(created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.file_attachments ADD CONSTRAINT file_attachments_task_id_fkey
 FOREIGN KEY(task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;
ALTER TABLE public.file_attachments ADD CONSTRAINT file_attachments_team_run_id_fkey
 FOREIGN KEY(team_run_id) REFERENCES public.team_runs(id) ON DELETE CASCADE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DELETE FROM auth.users WHERE id='10000000-0000-0000-0000-000000000001';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.file_attachments WHERE task_id='50000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Account deletion retained orphaned attachment'; END IF; END $$;
ROLLBACK;
\echo 'System hardening SQL regression checks passed'
