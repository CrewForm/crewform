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

## Scheduler ownership and duplicate prevention

With migration 088 and the matching runner/Edge code, both evaluators use `enqueue_scheduled_firing`. The transaction locks the workspace and trigger, compares the previously observed firing and enqueues once. Old evaluator binaries still bypass this protection: deploy both implementations before allowing overlap. Keep one primary scheduler for simpler operations.

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

## Reviewed hardening and pricing rollout

The reviewed catalogue is Free / Pro $15 / Team $49 per workspace per month.
Custom is an on-premises offer. The stored `enterprise` key remains compatible
with existing licences; it is not a new Cloud checkout plan. Provider inference
is separate. A workflow run is one task or one team run; step calls and automatic retries
are not additional monthly runs. An explicit rerun creates a new job and uses
a new allowance, preserving prior results. Inputs are copied before dispatch;
failed copying leaves a draft. Failed work after execution starts uses its
reservation; pre-start cancellation releases it. Past-due subscriptions receive seven days from first observed delinquency;
afterward hosted quotas use Free entitlements until recovery. Existing past-due
rows use their last update as the migration baseline. Stored paid-plan identity
is retained for billing recovery, while the effective plan controls execution.

Existing paid Team customers
retain their prior unlimited run allowance through a database override.

`shared/plan-catalogue.json` generates TypeScript and SQL definitions. Run
`npm run plans:generate` after edits and `npm run plans:check` in CI. To update
the separate landing checkout too, use the generator's `--landing` flag.

Before rollout:

1. Export schema, application/auth data and private storage with the existing
   backup process. Verify a restore and preserve the encryption key separately.
   The local synthetic restore test does not establish production recovery.
2. Run `scripts/tests/review-rollout-preflight.sql` read-only. Compare the live
   schema with a staged 086 baseline and resolve any drift. A project with empty
   migration history must not receive a blind `supabase db push`: that can replay
   historical schema/seed/cron operations. Do not apply locally staged IDs.
3. Generate the **new** 087–103 upgrade only with
   `node scripts/prepare-review-rollout.mjs /separate/new/output-directory`.
   Review its transaction and apply to a restored staging database first.
   Inventory Storage policies: broad manual policies can OR away restrictive
   policies and need explicit reconciliation. The upgrade replaces the named
   historical attachments policies and keeps the attachments bucket private.
4. Deploy matching Edge Functions and runner, including the authenticated
   internal outbound guard. Edge secrets `TASK_RUNNER_URL` and `WEBHOOK_SECRET`
   must refer to the same trusted runner; this is a backend credential. Requests
   fail closed when that guard is missing. Block that internal path at public
   ingress where possible. Configure request/connection/time limits in ingress.
5. Create **new** monthly USD Stripe prices for 1500 and 4900 cents, and set
   `STRIPE_PRO_PRICE_ID` / `STRIPE_TEAM_PRICE_ID`. Keep previous IDs in comma
   separated `STRIPE_PRO_LEGACY_PRICE_IDS` / `STRIPE_TEAM_LEGACY_PRICE_IDS` so
   renewals retain their plan. Do not bulk-update existing subscriptions.
   Checkout rejects a configured price whose amount/currency/interval differs
   from the catalogue. Verify the billing portal's allowed price changes too.
6. Verify workspace role isolation, quota failure, webhook replay, a new signup,
   renewal and cancellation in Stripe test mode before the live switch. Deploy
   frontend and landing pricing together only after checkout is ready.

Production rollback requires restoring the compatible application version
and reviewing database/Stripe state; do not blindly drop new usage/delivery
records. Record migration baseline and applied IDs once the production schema
comparison is complete. Neither bundle generation nor local tests deploy fixes.

Native execution requires immutable user attribution and a current database
consent snapshot. API/service-key jobs cannot inherit a personal login. Agent
configuration, inputs, team configuration and uploaded object versions must
still match the creator's approved dispatch, and membership must remain valid.
The actual loaded agent row must match that snapshot too. Active native work
locks its agent/team/profile/template configuration until completion or
cancellation; operational status updates remain allowed. Refresh approval by reviewing and redispatching your own pending job. Uploaded
input objects cannot be overwritten through the authenticated Storage policy.
CLI/MCP stdio programs and installed ACP agents remain trusted local code, not
an operating-system sandbox. Optional adapters need their own inventory.

Public widget history requires a server-issued 30-day session credential signed
for that widget. Caller-chosen visitor IDs and old widget caches cannot read it.
The new widget build is required with the new runner. `WIDGET_SESSION_SECRET`
(or `WEBHOOK_SECRET` as a fallback) must be set; rotating it invalidates existing
visitor sessions. History credentials travel in a header, not a URL query.

Public widgets receive a durable aggregate hourly limit, bounded history and
three queued/active requests at most. Their execution has at most 2 tool rounds,
2048 output tokens, no API fallback, and no inherited private tools. Explicit
`config.public_widget_tools` may grant `grammar_check`; `knowledge_search` also
requires an explicit nonempty `knowledge_base_ids` scope. Publishing that scope
makes those documents available to widget visitors; review it deliberately.

Output-route/Zapier delivery is queued in the same transaction as job state.
HTTP destinations receive a stable `Idempotency-Key`; other services may not
support deduplication. Expired delivery leases become `uncertain`. An owner/admin
may use `retry_output_delivery(id, true)` after checking the destination, since
an interrupted external write may already have succeeded. Failed deliveries
require an explicit retry; they are not silently declared delivered.

Approval requests and responses persist with task/interaction/step identity,
expiry and replay rejection. The helper can reuse an unchanged pending request.
Current executors do not have a general checkpoint/resume engine: interrupted
active jobs fail with an explanation rather than replaying tools/provider calls.
Review prior effects and create a new run deliberately. Runtime attempt records
measure worker wall time, not CPU time, an infrastructure invoice or model cost.

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
ownership link on unfinished jobs. Recovery fails interrupted active work for manual review. It does not rerun
provider calls or external writes automatically. Durable responses/deliveries
preserve decisions and uncertainty, while general workflow checkpoints remain
a separate implementation.

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

## Deploying personal workers

Ship this feature after the base security migrations and coordinated runner/Edge rollout. Apply migrations 104–105 once against a reconciled baseline; never replay local bootstrap migration IDs into production. Migration 105 removes the historical no-argument `claim_next_task()` overload; supported runners must use `claim_next_task(p_runner_id)`.

Deploy the Edge Function with gateway JWT verification disabled because its narrow device credential is validated by the handler and database RPCs:

```bash
supabase functions deploy personal-worker --no-verify-jwt
```

The CLI receives neither user JWTs nor database credentials. Pairing creation and exchange use proof-bound, expiring challenges. Approval and revocation require a signed-in browser session; ordinary workspace API keys cannot grant a laptop login. Device/lease tables remain inaccessible to anonymous callers. Do not enable native execution on the shared Cloud runner to support personal devices.

Verify that `personal-worker-maintenance` is active in pg_cron. It expires leases and unavailable queued work and prunes pairing budgets. Generic runner claims exclude personal tasks. Deploy a compatible runner before publishing the UI and CLI pairing instructions.

Before enabling production UI, run `scripts/tests/personal-worker.sql` on a disposable backend and `node scripts/tests/personal-worker-e2e.mjs <isolated-supabase-workdir>` while serving the local Edge Function with `--no-verify-jwt`. The latter creates and removes only synthetic local data and uses a fixture executor, never a provider login. Validate one explicitly selected real native login separately. Keep the UI hidden if the production function/schema or published CLI version is not ready.

For rollback, disable new pairing and dispatch in the UI, revoke device grants, stop workers, and wait for active leases to become terminal before reverting queue handling. Preserve completed results and audit rows. Do not switch queued personal jobs to API execution or drop the device-assignment column while compatible jobs exist.
