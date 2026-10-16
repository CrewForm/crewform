# Quick Start Guide

Start with an offline walkthrough, then choose a real execution environment.
CrewForm is MIT licensed and free to self-host. Paid plans cover CrewForm Cloud hosting.

## 1. Try the workflow without an account

Install Node.js 20+ and npm, then:

```bash
git clone https://github.com/CrewForm/crewform.git
cd crewform
npm --prefix cli ci
npm --prefix cli run build
node cli/dist/cli.js demo --output review-pack.json
```

This uses the real sequential pipeline engine with **scripted, simulated outputs**:
review a supplied fictional patch, critique the finding, and export a versioned
review pack. It makes no model requests, invokes no native agent and needs no
provider key, database or login. The pack contains a source reference, an explicit
limitation and `humanReview: required`. It does not measure model quality.

Use `--json` for machine-readable pipeline results. The generated `review-pack.json`
contains the simulated artifact; inspect it before moving on.

## 2. Choose real execution

- **Hosted app:** open [CrewForm Cloud](https://app.crewform.tech), create a workspace,
  then follow [Run Your First Agent System](/first-agent-system).
- **Local agent CLI:** follow [Local Agent Execution](/local-agents) to use a supported
  installed agent with its own login, or use an API provider/Ollama. Native account
  eligibility and limits still apply. There is no automatic API fallback.
- **Full self-hosted app:** use the supported stack below.

To check an installed agent without a model request:

```bash
node cli/dist/cli.js doctor --runtime codex:cli
# Or inspect all supported runtime executables:
node cli/dist/cli.js doctor --json
```

Diagnostics check Node and executable availability. They do not authenticate your
agent or prove that your subscription permits a particular use.

## 3. Run the full app locally

Install Docker and the Supabase CLI, start Docker, and run from the repository root:

```bash
npm ci
npm --prefix task-runner ci
npm run local:prepare
supabase start --workdir .crewform-local
node scripts/local-services.mjs env
npm --prefix task-runner run build
docker compose --env-file .crewform-local/app.env up --build -d
```

In a separate terminal:

```bash
node scripts/local-services.mjs functions
```

Open `http://localhost:3000` and register a local account. CrewForm requires the
complete Supabase stack, including Auth, Storage, Realtime and Edge Functions.
The bootstrap handles historical migration numbering and writes ignored local
configuration with restricted permissions. It leaves linked production state alone.

For production configuration, host processes, ports and shutdown instructions,
follow [Self-hosting CrewForm](/self-hosting). Provider-key encryption uses the
server-side `API_KEY_ENCRYPTION_KEY`; never put an encryption secret in a `VITE_`
variable, which would expose it to the browser.

## Troubleshooting

| Symptom | Next step |
|---|---|
| Offline demo fails | Confirm Node 20+, install CLI dependencies and rebuild; the demo does not need a backend |
| Doctor reports unavailable | Install the named executable and check its login separately |
| Local app cannot connect | Confirm the complete Supabase stack is running, then regenerate the local environment |
| Real run remains pending | Check runner health and backend connectivity; a successful frontend build does not start the runner |
| Stream disconnects | Check saved run history before retrying; disconnection does not prove execution stopped |

## Next steps

- [Run Your First Agent System](/first-agent-system) — A real three-step demo
- [Pipeline Teams](/pipeline-teams) — Sequential workflows and handoffs
- [CLI Tool](/cli) — Local configuration and execution
- [Local Agent Execution](/local-agents) — Native CLI, ACP and personal workers
- [Self-hosting CrewForm](/self-hosting) — Complete deployment requirements
