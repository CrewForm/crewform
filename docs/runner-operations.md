# Runner and schedule operations

The frontend runs on Vercel, and Supabase stores users, configuration, queues,
and results. The Node runner executes model/tool calls and serves MCP, A2A,
AG-UI, chat-widget, and knowledge-search endpoints. Changing the runner host
does not require moving the frontend or database.

## Diagnose before restarting

`GET /health` must return 200 only when the runner has a live registration and
a heartbeat confirmed within the last minute. Compare its `runnerId` with
`public.task_runners`. Older runners returned 200 even after that row was
deleted, leaving a process that could schedule work but could never claim it.

Run these read-only queries in the Supabase SQL editor:

```sql
select id, status, current_load, max_concurrency, last_heartbeat, started_at
from public.task_runners;

select 'tasks' as queue, status, count(*), min(created_at) as oldest
from public.tasks group by status
union all
select 'team_runs', status, count(*), min(created_at)
from public.team_runs group by status;

select jobid, jobname, schedule, active from cron.job;
select jobid, status, return_message, start_time
from cron.job_run_details order by start_time desc limit 10;

select status_code, timed_out, error_msg, created
from net._http_response order by created desc limit 10;
```

A successful pg_cron job only means PostgreSQL queued the HTTP request.
Inspect the HTTP response separately: 401 is not a successful evaluation.
Do not print cron commands or HTTP request headers; they may contain secrets.

Before restoring a stuck worker, decide which queued jobs remain relevant.
Restarting immediately can execute old prompts, spend model credits, and send
historical outputs to configured destinations. Review task IDs, destinations,
and dates before deciding to run or cancel them. Do not bulk-convert all
`pending` tasks to `dispatched`: pending tasks may be intentional drafts.

## Choose one scheduler

The current runner and Edge Function each evaluate triggers independently.
They do not share an atomic claim for a scheduled firing, so running both can
create duplicates. Use one until that transaction is implemented.

### Always-on runner (smallest change)

Keep `TRIGGER_SCHEDULER_ENABLED=true` (the default), use one replica, and disable
the redundant pg_cron job after confirming the local scheduler is working:

```sql
select cron.alter_job(jobid, active := false)
from cron.job where jobname = 'evaluate-cron-triggers';
```

This SQL changes production configuration; it is a deployment step, not a
diagnostic query. A restarted runner catches up missed schedules within a
48-hour window, producing one current job rather than replaying every interval.
Cron expressions are evaluated in UTC. The custom parser is not a complete
cron implementation; prefer simple expressions until parser validation and
standard day-of-month/day-of-week semantics are added.

### Supabase pg_cron (for an external scheduler)

Before switching, store two secrets in Supabase Vault through its dashboard:

- `crewform_project_url`: the Supabase API origin, not the frontend URL.
- `crewform_cron_secret`: exactly the same value as the `CRON_SECRET` Edge
  Function secret. Do not use the public anon key as a scheduler credential.

Deploy `cron-evaluate` with JWT verification disabled because it authenticates
the `x-cron-secret` header itself. Keep that secret authentication enabled.
Set its `TASK_RUNNER_URL` and `WEBHOOK_SECRET` to match the worker. The function
only enqueues work; a worker must still execute it.

After verifying the configuration, set the worker's
`TRIGGER_SCHEDULER_ENABLED=false` and replace the database job:

```sql
select cron.unschedule(jobid)
from cron.job where jobname = 'evaluate-cron-triggers';

select cron.schedule('evaluate-cron-triggers', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'crewform_project_url') || '/functions/v1/cron-evaluate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'crewform_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);
```

The correct pg_net function is `net.http_post`, not the
`extensions.http_post` call in historical migrations 079 and 083. Existing
deployments may have a manually configured job that differs from those files.
This runbook intentionally does not replay historical migrations against a
database with uncertain migration history.

The Edge evaluator currently does not add the local scheduler's workspace
context enrichment. Do not switch enriched schedules without implementing
parity. Verify `net._http_response`, `trigger_log`, and actual task completion;
checking just the cron job or the enqueue log is insufficient.

## Safe rollout of runner reliability changes

1. Review the historical queue and choose what to keep. Resolve invalid team
   configuration or plan requirements before reenabling recurring jobs.
2. Verify `SUPABASE_URL` is the API origin and `API_KEY_ENCRYPTION_KEY` matches
   the existing Edge Function encryption key. Do not generate a replacement
   key for already-encrypted credentials. `ENCRYPTION_KEY` is not the current
   variable name.
3. Keep one runner replica and one scheduler. Deploy the runner changes with
   the existing credentials and endpoints.
4. Confirm the new runner registration has advancing heartbeats and `/health`
   returns 200. A lost registration makes the process exit with code 1 so the
   hosting restart policy can obtain a fresh registration. Railway's configured
   healthcheck is a deployment readiness check, not continuous auto-healing.
5. Run one explicitly selected task, then a scheduled task. Confirm completion
   and output delivery. Observe multiple schedule cycles and a restart.
6. Keep the previous image available for rollback. Reverting restores the old
   registry bug, so continue monitoring the registration if rolling back.

Shutdown preserves dead runner rows until recovery, rather than deleting the
ownership link on unfinished jobs. Recovery is still at-least-once execution:
external writes need idempotency, and approvals need durable continuation.
The fixes do not establish exactly-once delivery or safe resumption of every
interrupted workflow.

## Hosting choices

At Railway's $5/month Hobby minimum, lower memory consumption does not reduce
the subscription below $5. Heartbeats, polling, and Realtime keep this worker
active, so Railway serverless sleep is not a solution for the current design.

Vercel's free cron offering and Supabase's free Edge Function duration limit
do not replace a persistent worker with potentially long agent runs. An
event-driven Cloud Run service is a possible future migration: keep the queue
and scheduler in Supabase, dispatch authenticated requests through a reliable
delivery mechanism, and execute work within the request's lifetime. Disable
permanent polling and persist continuation state for long runs and approvals.
The current webhook responds before execution finishes, so the existing image
is not a drop-in request-billed Cloud Run worker.

Cloud Run's compute free allowance may cover a small workload, but billing
setup, network traffic, container storage/builds, and usage above allowances
mean it is not a guaranteed zero-cost service. Choose a region near Supabase,
keep minimum instances at zero, and measure actual runtime before estimating
savings. A VPS adds another fixed bill and maintenance responsibility.

Sources checked 20 September 2026: [Railway plans](https://docs.railway.com/pricing/plans),
[Railway serverless](https://docs.railway.com/deployments/serverless),
[Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions),
[Supabase function limits](https://supabase.com/docs/guides/functions/limits),
[Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing),
[Cloud Run pricing](https://cloud.google.com/run/pricing),
[Cloud Run runtime](https://docs.cloud.google.com/run/docs/container-contract).
