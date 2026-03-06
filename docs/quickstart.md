# Quick Start Guide

Get CrewForm running locally in under 5 minutes.

## Prerequisites

- **Node.js** 20+
- **npm** 10+
- **Supabase** account (free tier works) — [supabase.com](https://supabase.com)
- At least one LLM API key (Anthropic, Google, or OpenAI)

## 1. Clone & Install

```bash
git clone https://github.com/CrewForm/crewform.git
cd crewform
npm install
```

## 2. Supabase Setup

1. Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Go to **Settings → API** and copy your **URL** and **anon key**
3. Go to **SQL Editor** and run each migration file in order:

```bash
# Files are in supabase/migrations/, run them in numeric order:
# 001_initial_schema.sql
# 002_rls_policies.sql
# ... through to the latest
```

## 3. Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_URL=http://localhost:5173
VITE_ENCRYPTION_KEY=generate-a-32-byte-hex-key
```

> **Generate an encryption key:** `openssl rand -hex 32`

## 4. Start Development

```bash
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) and sign up for an account.

## 5. Task Runner (for AI execution)

The task runner processes agent tasks. In a separate terminal:

```bash
cd task-runner
npm install
cp .env.example .env
# Add your LLM API keys to .env
npm start
```

## 6. Add Your First Agent

1. Navigate to **Agents → New Agent**
2. Give it a name and description
3. Select a model (e.g., `claude-sonnet-4-20250514`)
4. Write a system prompt
5. Go to **Settings → API Keys** and add your provider key
6. Create a task from the **Tasks** page to test it

## What's Next?

- [Agents Guide](./agents.md) — Deep dive into agent configuration
- [Pipeline Teams](./pipeline-teams.md) — Sequential multi-agent workflows
- [Orchestration Teams](./orchestration-teams.md) — Brain agent delegates to workers dynamically
- [Collaboration Teams](./collaboration-teams.md) — Agents discuss and reach consensus
- [Discord Integration](./discord-integration.md) — Connect Discord with `/ask` and `/connect`
- [API Reference](./api-reference.md) — REST API documentation
- [Self-Hosting Guide](./self-hosting.md) — Docker production deployment
