# CrewForm — Zapier Integration Testing Guide

> **App URL:** https://crewform.tech

## Test Account Credentials

| Field | Value |
|-------|-------|
| Email | `integration-testing@zapier.com` |
| Password | `Z@ppt35t@2026` |

---

## Step 1: Log In

1. Go to **https://crewform.tech/auth**
2. Enter the email and password above
3. Click **Sign In**
4. You'll land on the **Dashboard**

---

## Step 2: Create Your First Agent

An "Agent" is a configured AI assistant — you'll need at least one to test tasks and team runs.

1. Click **Agents** in the left sidebar
2. Click **+ New Agent**
3. Fill in:
   - **Name:** `Test Agent`
   - **Model:** Select any model (e.g. `gpt-4o`)
   - **System Prompt:** `You are a helpful assistant for testing.`
4. Click **Create Agent**

---

## Step 3: Create a Task

Tasks are units of work assigned to agents.

1. Click **Tasks** in the left sidebar
2. Click **+ New Task**
3. Fill in:
   - **Title:** `Test Task`
   - **Description:** `This is a test task for the Zapier integration.`
   - **Priority:** `Medium`
   - **Assign Agent:** Select the `Test Agent` you just created
4. Click **Create Task**

---

## Step 4: Create a Team (Optional)

Teams are multi-agent workflows. If you want to test team-related Zapier triggers:

1. Click **Teams** in the left sidebar
2. Click **+ New Team**
3. Fill in:
   - **Name:** `Test Pipeline`
   - **Mode:** `Pipeline`
4. Add the `Test Agent` as a step in the pipeline
5. Click **Create Team**

---

## Step 5: Generate an API Key

This is the key you'll use to connect CrewForm to Zapier.

1. Click **Settings** in the left sidebar (gear icon at the bottom)
2. Click the **API Keys** tab
3. Click **Generate Key**
4. **Copy the key immediately** — it's only shown once
5. The key will start with `cf_...`

> ⚠️ **Important:** Save this key securely. You'll paste it into Zapier when connecting the CrewForm app.

---

## Step 6: Connect to Zapier

1. In Zapier, search for **CrewForm** in the app directory
2. Click **Connect**
3. When prompted, paste the API key you copied in Step 5
4. Zapier will call the `/api-me` endpoint to verify the key — you should see your account name (**Zapier Test**) displayed

---

## Step 7: Test Zapier Triggers & Actions

### Available Triggers

| Trigger | What to do in CrewForm to fire it |
|---------|-----------------------------------|
| **Task Completed** | Go to Tasks → click a task → change status to "Completed" |
| **New Task Created** | Create a new task (Step 3 above) |
| **Team Run Completed** | Go to Teams → click team → click "Run" → wait for completion |

### Available Actions

| Action | What it does |
|--------|-------------|
| **Create Task** | Creates a new task in CrewForm |
| **Create Agent** | Creates a new agent in CrewForm |
| **Start Team Run** | Kicks off a team run |
| **Find Task** | Searches for a task by ID or status |

### Quick Test Workflow

Set up a simple Zap to verify the connection:

1. **Trigger:** CrewForm → New Task Created
2. **Action:** Send an email (Gmail, Outlook, etc.)
3. Go back to CrewForm and create a new task
4. Check that Zapier fires and the email is sent

---

## Navigation Reference

| Page | URL | What it shows |
|------|-----|---------------|
| Dashboard | `/` | Overview stats and recent activity |
| Agents | `/agents` | List of AI agents |
| Teams | `/teams` | Multi-agent workflows |
| Tasks | `/tasks` | Task list with status filters |
| Marketplace | `/marketplace` | Browse and install shared agents |
| Analytics | `/analytics` | Token usage and cost tracking |
| Settings | `/settings` | API Keys, billing, workspace config |

---

## Need Help?

- **Docs:** https://docs.crewform.tech
- **API Reference:** https://docs.crewform.tech/api-reference
- **Email:** team@crewform.tech
- **Discord:** https://discord.gg/TAFasJCTWs
