# Self-Hosting CrewForm

Run CrewForm on your own infrastructure with Docker Compose. This guide covers a **single-server deployment** suitable for teams and small organizations.

## Prerequisites

- **Docker** ≥ 24.0 and **Docker Compose** ≥ 2.20
- **2 GB RAM** minimum (4 GB recommended)
- **10 GB disk** for database + assets
- A **Supabase project** (hosted) or PostgreSQL 15+ (direct mode)

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/CrewForm/crewform.git
cd crewform

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set POSTGRES_PASSWORD

# 3. Start all services
docker compose up -d

# 4. Check status
docker compose ps
```

The frontend will be available at **http://localhost:3000**.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Docker Compose                    │
│                                                     │
│  ┌────────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  postgres   │  │ migrate  │  │   task-runner   │  │
│  │  (PG 15)   │←─│ (17 SQL) │  │  (Node + tsx)   │  │
│  │  :5432     │  │ one-shot │  │  polling loop   │  │
│  └────────────┘  └──────────┘  └────────────────┘  │
│         │                              │            │
│         └──────────┬───────────────────┘            │
│                    │                                │
│  ┌─────────────────▼───────────────────────────┐    │
│  │            frontend (nginx)                  │    │
│  │          Vite build → :3000                  │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## Services

| Service | Image | Purpose | Port |
|---------|-------|---------|------|
| `postgres` | postgres:15-alpine | Database with persistent volume | 5432 |
| `migrate` | postgres:15-alpine | Runs SQL migrations, then exits | — |
| `frontend` | nginx:1.27-alpine | Serves Vite build (SPA routing) | 3000 |
| `task-runner` | node:20-alpine | AI task execution polling service | — |

## Configuration

### Required Variables

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | Database password (choose a strong one) |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (task-runner) |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_DB` | crewform | Database name |
| `POSTGRES_USER` | crewform | Database user |
| `POSTGRES_PORT` | 5432 | PostgreSQL port |
| `FRONTEND_PORT` | 3000 | Frontend port |
| `VITE_APP_URL` | http://localhost:3000 | Public app URL |
| `ENCRYPTION_KEY` | — | 32-byte hex for AES-256-GCM |
| `OPENAI_API_KEY` | — | Fallback OpenAI key |
| `ANTHROPIC_API_KEY` | — | Fallback Anthropic key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | — | Fallback Google AI key |
| `DISCORD_BOT_TOKEN` | — | Bot token for the managed CrewForm Discord bot (from Discord Developer Portal) |
| `DISCORD_PUBLIC_KEY` | — | Ed25519 public key for Discord signature verification (required to register an Interactions Endpoint) |

## Database Migrations

Migrations run automatically on startup via the `migrate` container. It:

1. Creates a `_migrations` tracking table
2. Runs all `supabase/migrations/*.sql` files in sorted order
3. Skips already-applied migrations
4. Exits after completion

To run migrations manually:

```bash
docker compose run --rm migrate
```

## Managing the Stack

```bash
# View logs
docker compose logs -f

# View logs for a specific service
docker compose logs -f task-runner

# Restart a service
docker compose restart task-runner

# Stop all services
docker compose down

# Stop and remove volumes (⚠️ deletes database!)
docker compose down -v

# Rebuild after code changes
docker compose build --no-cache
docker compose up -d
```

## Updating

### Using the Update Script (Recommended)

```bash
# Update to the latest version
./docker/update.sh

# Or update to a specific tag/branch
./docker/update.sh v1.2.0
```

The script will:
1. Pull the latest code
2. Stop running containers (data is preserved)
3. Rebuild images
4. Restart services (migrations run automatically)

### Manual Update

```bash
# 1. Pull latest code
git pull origin main

# 2. Check for new environment variables
diff .env .env.example

# 3. Rebuild and restart
docker compose down
docker compose build --no-cache
docker compose up -d

# 4. Verify migrations ran
docker compose logs migrate
```

> **💡 Tip:** Always check `.env.example` after updating — new features may require additional environment variables.

## Troubleshooting

### Migrations fail
```bash
# Check migration logs
docker compose logs migrate

# Run migrations manually with verbose output
docker compose run --rm migrate
```

### Frontend shows blank page
- Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly
- Check nginx logs: `docker compose logs frontend`

### Task runner not processing tasks
- Check that `SUPABASE_SERVICE_ROLE_KEY` is set
- View logs: `docker compose logs -f task-runner`
- Ensure the task-runner can reach the Supabase URL

### Database connection issues
- Verify `POSTGRES_PASSWORD` matches across services
- Check postgres health: `docker compose exec postgres pg_isready`

## Production Considerations

- **HTTPS**: Put a reverse proxy (Caddy, Traefik, or nginx) in front with TLS
- **Backups**: Schedule `pg_dump` via cron
- **Monitoring**: Add health check endpoints and uptime monitoring
- **Secrets**: Use Docker secrets or a vault for sensitive values
- **Memory**: Monitor task-runner memory usage with AI provider calls
