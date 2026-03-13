# REST API Reference

CrewForm provides two API layers:

- **[API v2](#api-v2-recommended)** — Edge Functions API with versioned envelopes, rate limiting, and pagination *(recommended)*
- **[API v1 (Legacy)](#api-v1-legacy)** — Direct Supabase PostgREST access *(still supported)*

---

# API v2 (Recommended)

> **Base URL:** `https://<your-project>.supabase.co/functions/v1`

The v2 API uses CrewForm Edge Functions with structured responses, per-tier rate limiting, and cursor-based pagination.

## Authentication

All requests require one of:

| Method | Header | Use case |
|--------|--------|----------|
| **API Key** | `X-API-Key: cf_your_key` | Zapier, scripts, third-party tools |
| **JWT** | `Authorization: Bearer <token>` | Frontend, authenticated clients |

Generate API keys in **Settings → API Keys**.

## Versioning

Set `X-API-Version: 2` to opt into v2 response format. Omitting the header defaults to v1 (raw data, no envelope).

```bash
curl -H "X-API-Key: cf_..." \
     -H "X-API-Version: 2" \
     https://your-project.supabase.co/functions/v1/api-agents
```

## Response Format

**v2 Success:**
```json
{
  "data": { ... },
  "meta": {
    "api_version": 2,
    "request_id": "req_abc123def456",
    "timestamp": "2026-03-13T10:00:00.000Z"
  }
}
```

**v2 List (paginated):**
```json
{
  "data": {
    "items": [ ... ],
    "next_cursor": "2026-03-12T08:00:00.000Z",
    "has_more": true
  },
  "meta": { ... }
}
```

**v2 Error:**
```json
{
  "error": {
    "code": "not_found",
    "message": "Agent not found"
  },
  "meta": { ... }
}
```

## Rate Limits

Enforced per workspace per minute:

| Plan | Requests/min |
|------|-------------|
| Free | 30 |
| Pro | 120 |
| Team | 300 |
| Enterprise | 600 |

Every response includes:

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 117
X-RateLimit-Reset: 1710324360
```

Exceeding the limit returns `429 Too Many Requests` with a `Retry-After` header.

## Pagination

List endpoints support cursor-based pagination:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 50 | Items per page |
| `cursor` | string | — | Cursor from `next_cursor` of previous response |

```bash
# First page
curl -H "X-API-Key: cf_..." -H "X-API-Version: 2" \
  "https://.../functions/v1/api-agents?limit=10"

# Next page
curl -H "X-API-Key: cf_..." -H "X-API-Version: 2" \
  "https://.../functions/v1/api-agents?limit=10&cursor=2026-03-12T08:00:00.000Z"
```

---

## Endpoints

### Agents — `/functions/v1/api-agents`

| Method | Params | Description |
|--------|--------|-------------|
| `GET` | — | List all agents |
| `GET` | `?id=<uuid>` | Get single agent |
| `POST` | body | Create agent |
| `PATCH` | `?id=<uuid>` + body | Update agent |
| `DELETE` | `?id=<uuid>` | Delete agent |

**Create body:**
```json
{
  "name": "Code Reviewer",
  "model": "claude-sonnet-4-20250514",
  "description": "Reviews code for bugs and best practices",
  "system_prompt": "You are a senior code reviewer...",
  "temperature": 0.3,
  "tools": [],
  "status": "idle"
}
```

### Tasks — `/functions/v1/api-tasks`

| Method | Params | Description |
|--------|--------|-------------|
| `GET` | — | List all tasks |
| `GET` | `?status=running` | Filter by status |
| `GET` | `?id=<uuid>` | Get single task |
| `POST` | body | Create task (auto-dispatches if agent/team assigned) |
| `PATCH` | `?id=<uuid>` + body | Update task |
| `DELETE` | `?id=<uuid>` | Delete task |

**Create body:**
```json
{
  "title": "Review PR #42",
  "description": "Review the authentication changes",
  "priority": "high",
  "assigned_agent_id": "<uuid>",
  "metadata": {}
}
```

**Task statuses:** `pending`, `dispatched`, `running`, `completed`, `failed`, `cancelled`

**Task priorities:** `low`, `medium`, `high`, `urgent`

### Teams — `/functions/v1/api-teams`

| Method | Params | Description |
|--------|--------|-------------|
| `GET` | — | List all teams (includes members) |
| `GET` | `?id=<uuid>` | Get single team |
| `POST` | body | Create team |
| `PATCH` | `?id=<uuid>` + body | Update team |
| `DELETE` | `?id=<uuid>` | Delete team |

**Create body:**
```json
{
  "name": "Content Pipeline",
  "description": "Research → Write → Edit",
  "mode": "pipeline",
  "config": {
    "steps": [
      {
        "agent_id": "<uuid>",
        "step_name": "Research",
        "instructions": "Research the topic thoroughly",
        "expected_output": "Detailed research notes",
        "on_failure": "retry",
        "max_retries": 2
      }
    ],
    "auto_handoff": true
  }
}
```

**Team modes:** `pipeline`, `orchestrator`, `collaboration`

### Team Runs — `/functions/v1/api-runs`

| Method | Params | Description |
|--------|--------|-------------|
| `GET` | — | List all runs |
| `GET` | `?team_id=<uuid>` | Filter by team |
| `GET` | `?id=<uuid>` | Get single run (includes messages) |
| `POST` | body | Start a new team run |

**Create body:**
```json
{
  "team_id": "<uuid>",
  "input_task": "Research the latest trends in AI agent frameworks"
}
```

### Webhook Hooks — `/functions/v1/api-hooks`

| Method | Params | Description |
|--------|--------|-------------|
| `GET` | — | List active webhook subscriptions |
| `POST` | body | Subscribe (Zapier REST Hook) |
| `DELETE` | `?id=<uuid>` | Unsubscribe |

**Subscribe body:**
```json
{
  "target_url": "https://hooks.zapier.com/...",
  "event": "task_completed"
}
```

### Identity — `/functions/v1/api-me`

| Method | Description |
|--------|-------------|
| `GET` | Returns current user, workspace, plan, and API version |

**Response:**
```json
{
  "id": "<user-uuid>",
  "email": "user@example.com",
  "name": "Vince",
  "workspace_id": "<workspace-uuid>",
  "workspace_name": "My Workspace",
  "plan": "pro",
  "api_version": 2
}
```

---

## Error Codes (v2)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `bad_request` | 400 | Invalid request body or parameters |
| `unauthorized` | 401 | Missing or invalid authentication |
| `not_found` | 404 | Resource not found |
| `method_not_allowed` | 405 | HTTP method not supported |
| `rate_limit_exceeded` | 429 | Too many requests |
| `internal_error` | 500 | Server error |

---

## Example: cURL

```bash
# List agents (v2 with envelope)
curl -s \
  -H "X-API-Key: cf_abc123..." \
  -H "X-API-Version: 2" \
  "https://your-project.supabase.co/functions/v1/api-agents"

# Create a task and auto-dispatch to an agent
curl -s -X POST \
  -H "X-API-Key: cf_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"title":"Review PR","description":"...","assigned_agent_id":"<uuid>"}' \
  "https://your-project.supabase.co/functions/v1/api-tasks"

# Start a team run
curl -s -X POST \
  -H "X-API-Key: cf_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"team_id":"<uuid>","input_task":"Research AI trends"}' \
  "https://your-project.supabase.co/functions/v1/api-runs"
```

---
---

# API v1 (Legacy)

> **Base URL:** `https://<your-project>.supabase.co/rest/v1`

The v1 API provides direct Supabase PostgREST access. It is still supported but we recommend migrating to [API v2](#api-v2-recommended) for rate limiting, structured responses, and pagination.

## Authentication

All API requests require a REST API key in the `Authorization` header:

```bash
curl -H "Authorization: Bearer crfm_your_api_key" \
     -H "Content-Type: application/json" \
     https://your-project.supabase.co/rest/v1/agents
```

### Creating API Keys

1. Go to **Settings → API Keys**
2. Click **Generate Key**
3. Copy the key — it's only shown once
4. The key is hashed (SHA-256) before storage for security

## Endpoints

All endpoints are accessed via the Supabase REST API at:

```
https://<your-project>.supabase.co/rest/v1/<table>
```

You also need the `apikey` header with your Supabase anon key:

```bash
curl -H "Authorization: Bearer crfm_your_api_key" \
     -H "apikey: your-supabase-anon-key" \
     https://your-project.supabase.co/rest/v1/agents
```

---

## Agents

### List Agents

```http
GET /rest/v1/agents?select=*
```

**Response:**

```json
[
  {
    "id": "uuid",
    "name": "Code Reviewer",
    "description": "Reviews code for bugs and best practices",
    "model": "claude-sonnet-4-20250514",
    "provider": "anthropic",
    "system_prompt": "You are a senior code reviewer...",
    "temperature": 0.3,
    "max_tokens": 4096,
    "tags": ["code", "review"],
    "workspace_id": "uuid",
    "created_at": "2026-01-15T10:00:00Z",
    "updated_at": "2026-01-15T10:00:00Z"
  }
]
```

### Create Agent

```http
POST /rest/v1/agents
Content-Type: application/json

{
  "name": "Code Reviewer",
  "model": "claude-sonnet-4-20250514",
  "provider": "anthropic",
  "system_prompt": "You are a senior code reviewer...",
  "workspace_id": "your-workspace-id"
}
```

### Update Agent

```http
PATCH /rest/v1/agents?id=eq.{agent_id}
Content-Type: application/json

{
  "name": "Updated Name",
  "temperature": 0.5
}
```

### Delete Agent

```http
DELETE /rest/v1/agents?id=eq.{agent_id}
```

---

## Tasks

### List Tasks

```http
GET /rest/v1/tasks?select=*&order=created_at.desc
```

**Query parameters for filtering:**

| Parameter | Example | Description |
|-----------|---------|-------------|
| `status` | `eq.running` | Filter by status |
| `priority` | `eq.high` | Filter by priority |
| `agent_id` | `eq.{uuid}` | Filter by assigned agent |

### Create Task

```http
POST /rest/v1/tasks
Content-Type: application/json

{
  "title": "Review PR #42",
  "description": "Review the authentication changes",
  "agent_id": "uuid",
  "priority": "high",
  "workspace_id": "your-workspace-id"
}
```

**Task statuses:** `pending`, `running`, `completed`, `failed`, `cancelled`

**Task priorities:** `low`, `medium`, `high`, `critical`

### Get Task Detail

```http
GET /rest/v1/tasks?id=eq.{task_id}&select=*
```

---

## Teams

### List Teams

```http
GET /rest/v1/teams?select=*
```

### Create Team

```http
POST /rest/v1/teams
Content-Type: application/json

{
  "name": "Content Pipeline",
  "description": "Research → Write → Edit",
  "mode": "pipeline",
  "workspace_id": "your-workspace-id"
}
```

### Team Runs

```http
GET /rest/v1/team_runs?team_id=eq.{team_id}&select=*&order=created_at.desc
```

---

## Usage Records

### Query Usage

```http
GET /rest/v1/usage_records?select=*&created_at=gte.2026-01-01&order=created_at.desc
```

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `task_id` | uuid | Associated task |
| `agent_id` | uuid | Agent that ran |
| `provider` | string | LLM provider |
| `model` | string | Model used |
| `prompt_tokens` | integer | Input tokens |
| `completion_tokens` | integer | Output tokens |
| `estimated_cost_usd` | decimal | Estimated cost |
| `billing_model` | string | `per-token` or `subscription-quota` |

---

## Marketplace

### Browse Agents

```http
GET /rest/v1/agents?is_marketplace=eq.true&select=*
```

### Install Agent (RPC)

```http
POST /rest/v1/rpc/increment_install_count
Content-Type: application/json

{
  "agent_row_id": "uuid"
}
```

---

## Rate Limits (v1)

The Supabase free tier includes:
- **500 requests/minute** per API key
- **50,000 requests/month** total

For higher limits, upgrade your Supabase plan.

## Error Handling (v1)

All errors follow the standard Supabase/PostgREST format:

```json
{
  "code": "PGRST301",
  "message": "Row not found",
  "details": null,
  "hint": null
}
```

Common error codes:

| HTTP Status | Meaning |
|-------------|---------|
| `401` | Missing or invalid API key |
| `403` | Row-Level Security denied access |
| `404` | Resource not found |
| `409` | Conflict (duplicate key) |
| `422` | Validation error |


