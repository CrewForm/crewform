# Deploy with Coolify

[Coolify](https://coolify.io) is an open-source, self-hostable alternative to Vercel, Netlify, and Heroku. It provides a clean UI for managing Docker deployments on your own servers — no vendor lock-in.

This guide walks you through deploying CrewForm on Coolify.

## Prerequisites

- A running **Coolify v4** instance ([installation guide](https://coolify.io/docs/installation))
- A server connected to Coolify with **≥ 2 GB RAM** (4 GB recommended)
- A **Supabase project** (or self-hosted PostgreSQL 15+)

## Method 1: Docker Compose (Recommended)

This deploys the full CrewForm stack (frontend, task-runner, postgres, migrations) using the built-in `docker-compose.yml`.

### Step 1 — Create a New Resource

1. Open your Coolify dashboard
2. Click **+ Add New Resource**
3. Select **Docker Compose**
4. Choose **Git Repository** as the source

### Step 2 — Connect the Repository

| Field | Value |
|-------|-------|
| Repository URL | `https://github.com/CrewForm/crewform` |
| Branch | `main` |
| Docker Compose Location | `docker-compose.yml` |

Click **Check Repository** to validate.

### Step 3 — Configure Environment Variables

In the **Environment Variables** tab, add the required variables:

```env
# ─── Required ─────────────────────────────────
POSTGRES_PASSWORD=your-strong-database-password
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...

# ─── Recommended ──────────────────────────────
VITE_APP_URL=https://crewform.yourdomain.com
ENCRYPTION_KEY=your-32-byte-hex-key

# ─── Optional (LLM fallback keys) ─────────────
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
```

> **💡** Generate a secure encryption key: `openssl rand -hex 32`

### Step 4 — Configure Networking

In the **Network** tab:

1. Set the **Exposed Port** to `3000` (the frontend port)
2. Add your custom domain (e.g. `crewform.yourdomain.com`)
3. Enable **HTTPS** — Coolify handles TLS certificates automatically via Let's Encrypt

### Step 5 — Deploy

Click **Deploy**. Coolify will:

1. Clone the repository
2. Run `docker compose up -d`
3. Execute database migrations automatically (via the `migrate` container)
4. Start the frontend on port 3000
5. Start the task-runner for AI execution

Monitor progress in the **Logs** tab.

### Step 6 — Verify

Visit your configured domain. You should see the CrewForm login screen.

Check individual service logs:
- **Frontend** → nginx serving the SPA
- **Task Runner** → should show `[runner] Polling for tasks...`
- **Migrate** → should show `All migrations applied` and exit

---

## Method 2: Git-Based (Frontend Only)

If you're using **Supabase Cloud** and only need to deploy the frontend + task-runner (no local Postgres), you can use Coolify's Git-based deployment.

### Step 1 — Create a Nixpacks Resource

1. Click **+ Add New Resource**
2. Select **Application**
3. Choose **Public Repository**
4. Enter: `https://github.com/CrewForm/crewform`
5. Branch: `main`

### Step 2 — Build Settings

| Setting | Value |
|---------|-------|
| Build Pack | **Nixpacks** |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Start Command | `npm run preview` |
| Port | `3000` |

### Step 3 — Environment Variables

Add the same Supabase variables from Method 1 (skip `POSTGRES_*` variables since you're using Supabase Cloud).

### Step 4 — Deploy

Click **Deploy**. Coolify will build and serve the frontend.

> **⚠️ Note:** You'll need to deploy the task-runner separately as a Docker container, or run it on the same server via Docker Compose. The task-runner is required for AI task execution.

---

## Updating

### Automatic Updates

Coolify supports **webhook-based auto-deploy**:

1. Go to your resource **Settings**
2. Enable **Auto Deploy** on push
3. Add the Coolify webhook URL to your GitHub repository's webhooks

Every push to `main` will trigger a rebuild.

### Manual Updates

1. Open your resource in Coolify
2. Click **Redeploy**
3. Coolify pulls the latest code, rebuilds, and runs migrations

---

## Adding Ollama (Local AI)

To run local models alongside CrewForm on the same Coolify server:

### Step 1 — Add Ollama as a Service

1. Create a new **Docker** resource in Coolify
2. Use the image: `ollama/ollama`
3. Mount a volume: `/root/.ollama` → `ollama_data`
4. Expose port: `11434`

### Step 2 — Pull Models

Connect to the Ollama container and pull your preferred models:

```bash
# Via Coolify's terminal or SSH
docker exec -it <ollama-container> ollama pull llama3.3
docker exec -it <ollama-container> ollama pull deepseek-r1:8b
```

### Step 3 — Connect in CrewForm

1. Go to **Settings → LLM Setup** in CrewForm
2. Find **Ollama (Local)** in the provider list
3. Enter any value as the API key (e.g. `ollama`)
4. If Ollama and CrewForm are on the same Coolify server, the task-runner reaches Ollama at `http://ollama:11434/v1` (Docker network) or `http://host.docker.internal:11434/v1`

### GPU Passthrough

If your server has an NVIDIA GPU, add to the Ollama service in Coolify:

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

---

## Troubleshooting

### Frontend shows blank page
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Coolify's environment variables
- Check the frontend container logs in Coolify

### Task runner not processing
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set
- Check the task-runner logs in Coolify's **Logs** tab
- Verify network connectivity to Supabase

### Migrations not running
- Check the `migrate` container logs — it runs once and exits
- To re-run, restart the migrate service from Coolify

### Domain not resolving
- Ensure your DNS A record points to the Coolify server IP
- Check that Coolify's proxy (Traefik) is running: Coolify → Settings → Proxy

> **Need help?** Join our [Discord](https://discord.gg/TAFasJCTWs) or open an [issue on GitHub](https://github.com/CrewForm/crewform/issues).
