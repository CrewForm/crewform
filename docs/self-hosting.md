# Self-hosting CrewForm

CrewForm needs a **complete Supabase backend**: PostgreSQL, Auth, REST, Realtime, Storage and Edge Functions. The application Compose file runs the frontend and task runner; it does not turn plain PostgreSQL into Supabase.

## Local evaluation with Docker and Supabase CLI

Install Node.js 20+, Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). Start Docker, then run from the repository root:

```bash
npm ci
npm --prefix task-runner ci
npm run local:prepare
supabase start --workdir .crewform-local
node scripts/local-services.mjs env
npm --prefix task-runner run build
docker compose --env-file .crewform-local/app.env up --build -d
```

Open `http://localhost:3000` and register a local account. Email confirmations are disabled for this local evaluation configuration. Studio is at `http://localhost:56323`; the backend API is at `http://localhost:56321`. These separate ports avoid Supabase's default ports.

Serve Edge Functions in another terminal:

```bash
node scripts/local-services.mjs functions
```

The local function gateway disables its JWT precheck; CrewForm handlers still perform their own authentication. This is a local development setting, not an instruction to remove production authentication.

The bootstrap stages migration copies with unique versions because two historical source migrations use version `002`. A banned system identity with no password provides ownership for the historical marketplace seed; it cannot sign in. The bootstrap leaves `supabase/.temp` and linked production state alone. Configuration and secrets live in the ignored `.crewform-local/` directory with restricted file permissions. Re-running environment generation preserves your encryption and webhook secrets.

To run the application directly on the host instead of Compose:

```bash
node scripts/local-services.mjs frontend
node scripts/local-services.mjs runner  # separate terminal
```

Do not run the host runner and Compose runner simultaneously when testing a native account. Stop the Compose runner first with `docker compose --env-file .crewform-local/app.env stop task-runner`.

Stop local services without deleting data:

```bash
docker compose --env-file .crewform-local/app.env down
supabase stop --workdir .crewform-local
```

`supabase db reset --workdir .crewform-local` destroys and recreates **local** data. Do not run a reset against a linked or production database.

## Production

Use a complete [self-hosted Supabase stack](https://supabase.com/docs/guides/self-hosting/docker) or a managed Supabase project. Apply migrations with your existing migration/deployment process, deploy CrewForm's Edge Functions, and configure the same encryption and webhook secrets on the functions and runner. Review each migration and back up an existing database before applying changes. The local bootstrap above is for evaluation; it is not a production deployment manager.

Copy `.env.example` to an untracked `.env`, then set:

- `VITE_SUPABASE_URL`: browser-accessible HTTPS backend URL.
- `SUPABASE_INTERNAL_URL`: URL reachable from the runner container. Docker's `localhost` is the container; for a backend on the host use `host.docker.internal`.
- `VITE_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`: public and trusted server keys respectively.
- `API_KEY_ENCRYPTION_KEY`: the same 32-byte hex AES key used by Edge Functions.
- `WEBHOOK_SECRET`: the same secret used by inbound database webhooks.
- `VITE_APP_URL` and `VITE_TASK_RUNNER_URL`: externally reachable application and runner URLs.

```bash
docker compose --env-file .env config --quiet
docker compose --env-file .env up --build -d
```

The runner port binds to loopback by default. Expose it through an authenticated HTTPS reverse proxy when using remote MCP, A2A or AG-UI clients. Configure Auth redirects, SMTP, backups, monitoring, storage and TLS in your Supabase installation.

Community Edition has no hosted agent/task/team resource quotas. Pipeline mode, basic orchestration, marketplace publishing, A2A publishing and the chat widget are community capabilities. Collaboration, memory, RBAC, advanced analytics and audit features keep their existing paid entitlements.

## Existing agent subscriptions

See [local agent execution](local-agents.md). Native tools are deliberately absent from the stock runner image. Use a trusted host runner with the official tools installed and signed in. Never mount your personal credential directory into an untrusted or shared worker.
