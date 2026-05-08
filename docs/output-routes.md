# Output Routes

Output routes deliver agent and team run results to external destinations when a task completes or fails. Each route listens for specific events and posts a structured payload to its configured destination.

Supported destinations:

| Type | How it delivers |
|------|----------------|
| [HTTP Webhook](#http-webhook) | POST to any URL with HMAC-SHA256 signing |
| [Slack](#slack) | Incoming Webhook — formatted message with result block |
| [Discord](#discord) | Discord Webhook — embedded message with result |
| [Telegram](#telegram) | Bot API — sends message to a chat or group |
| [Microsoft Teams](#microsoft-teams) | Incoming Webhook — Adaptive Card |
| [Asana](#asana) | Creates a task in a project via Personal Access Token |
| [Trello](#trello) | Creates or updates a card on a board via API Key + Token |
| [Notion](#notion) | Creates a page in a database via Integration Token |
| [GitHub Issues](#github-issues) | Creates an issue in a repository via Personal Access Token |
| [Email (Resend)](#email-resend) | Sends HTML email via Resend API |
| [SMTP Email](#smtp-email) | Sends email via custom SMTP server (nodemailer) |
| [Linear](#linear) | Creates an issue via GraphQL API with team label resolution |
| [Google Sheets](#google-sheets) | Appends rows to a spreadsheet via OAuth 2.0 |
| [Gmail](#gmail) | Sends email from your connected Google account via OAuth 2.0 |
| [Google Docs](#google-docs) | Creates a document in Google Drive via OAuth 2.0 |
| [Google Calendar](#google-calendar) | Creates a review event via OAuth 2.0 |

---

## Concepts

### Events

Every route subscribes to one or more events. Only matching events trigger delivery:

| Event | Fires when |
|-------|-----------|
| `task.completed` | An agent task finishes successfully |
| `task.failed` | An agent task errors out |
| `team_run.completed` | A pipeline, orchestrator, or collaboration team run finishes |
| `team_run.failed` | A team run errors out |

### Payload

Every route receives the same JSON payload:

```json
{
  "event": "task.completed",
  "task_id": "uuid-or-null",
  "team_run_id": "uuid-or-null",
  "task_title": "Summarise Q4 earnings report",
  "agent_name": "Research Analyst",
  "status": "completed",
  "result_preview": "First 500 chars of the result...",
  "result_full": "Full result text...",
  "error": null,
  "timestamp": "2026-03-06T18:00:00.000Z",
  "attachments": [
    {
      "name": "report.pdf",
      "type": "application/pdf",
      "size": 204800,
      "url": "https://... (signed, expires in 24h)",
      "direction": "input"
    }
  ]
}
```

- `result_full` — the complete output. Some destinations (Slack, Discord, Telegram, Teams) truncate long outputs in the formatted message; use HTTP if you need the full untruncated result.
- `attachments` — file attachments associated with the task or team run. Signed download URLs expire after 24 hours.
- `task_id` or `team_run_id` — only one will be set, depending on whether the event is from an agent task or a team run.

### Retry

Each delivery is attempted up to **2 times** (initial + 1 retry after 5 seconds). Failed deliveries are logged in **Settings → Output Routes → Logs** with the HTTP status code and error message.

### Scoping Deliveries

By default, all active routes in a workspace receive all matching events. You can restrict an agent or team to only send to specific routes — see the [Output Routes selector in Agents](./agents.md#output-routes) and [Pipeline Teams](./pipeline-teams.md#output-routes).

---

## Creating a Route

1. Go to **Settings → Output Routes**
2. Click **New Route**
3. Choose the destination type and configure it
4. Select which events to subscribe to
5. Save — optionally test with the **Send Test** button

---

## HTTP Webhook

The most flexible option. CrewForm POSTs the full JSON payload to your URL. Use this for custom integrations, internal tooling, or platforms not natively supported.

### Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **URL** | ✅ | HTTPS endpoint to POST to |
| **Secret** | Optional | If set, CrewForm signs the payload with HMAC-SHA256 |

### Signature Verification

If you set a secret, CrewForm adds a `X-CrewForm-Signature` header to every request:

```
X-CrewForm-Signature: sha256=<hex-signature>
```

The signature is computed as `HMAC-SHA256(secret, raw-body)`. Verify it on your server:

```javascript
// Node.js example
const crypto = require('crypto');

function verifyCrewFormSignature(rawBody, secret, signatureHeader) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader),
    Buffer.from(expected)
  );
}
```

```python
# Python example
import hmac, hashlib

def verify_signature(raw_body: bytes, secret: str, header: str) -> bool:
    expected = 'sha256=' + hmac.new(
        secret.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, header)
```

### Example Handler (Express)

```javascript
app.post('/crewform-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-crewform-signature'];
  if (!verifyCrewFormSignature(req.body, process.env.CREWFORM_SECRET, sig)) {
    return res.status(401).send('Invalid signature');
  }

  const payload = JSON.parse(req.body);
  console.log(`Event: ${payload.event}, Task: ${payload.task_title}`);
  console.log(`Result: ${payload.result_full}`);

  res.sendStatus(200);
});
```

> **Tip:** CrewForm treats any 2xx response as success. Return 200 quickly and process async to avoid timeouts.

---

## Slack

Posts a formatted message to a Slack channel via an Incoming Webhook. Results appear in a coloured attachment block — green for completed, red for failed.

### Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App → From Scratch**
2. Go to **Incoming Webhooks** → Enable → **Add New Webhook to Workspace**
3. Select the channel and click **Allow**
4. Copy the **Webhook URL** (starts with `https://hooks.slack.com/...`)

### Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **Webhook URL** | ✅ | Slack Incoming Webhook URL |

### Message Format

Messages are posted as Block Kit attachments:

```
✅ Task completed: Summarise Q4 earnings report
Agent: Research Analyst

```result output here```
```

> **Truncation:** Results over 2,900 characters are truncated in the Slack message. Full output is always available in the HTTP webhook payload.

---

## Discord

Posts an embedded message to a Discord channel via a Discord Webhook.

### Setup

1. In Discord, open the channel settings → **Integrations → Webhooks**
2. Click **New Webhook** → give it a name
3. Copy the **Webhook URL**

### Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **Webhook URL** | ✅ | Discord Webhook URL |

### Message Format

Results appear as Discord embeds — green border for completed, red for failed — with agent name, task title, status, and result inline.

> **Truncation:** Results over 1,000 characters are truncated in the Discord embed. Use HTTP webhook if you need full output.

> **Note:** This is a one-way **output route** (CrewForm → Discord). For two-way integration where Discord users can trigger agents via `/ask`, see the [Discord Integration guide](./discord-integration.md).

---

## Telegram

Sends a message to a Telegram chat or group via the Bot API.

### Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copy the **Bot Token** (format: `123456789:AABBcc...`)
3. Get the **Chat ID** of the target chat:
   - For personal chats: message the bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` and find `chat.id`
   - For groups: add the bot to the group, send a message, check `getUpdates`
   - For channels: add the bot as admin, use the channel's `@username` as the chat ID (e.g. `@mycrewformchannel`) or the numeric ID (e.g. `-1001234567890`)

### Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **Bot Token** | ✅ | Token from @BotFather |
| **Chat ID** | ✅ | Numeric chat ID, group ID, or `@channelusername` |

### Message Format

```
✅ Task completed

Title: Summarise Q4 earnings report
Agent: Research Analyst

```result output here```
```

> **Truncation:** Results over 3,500 characters are truncated in the Telegram message.

> **Note:** This is a one-way **output route** (CrewForm → Telegram). For two-way integration where Telegram users can trigger agents, see the [Telegram Channel guide](./channels.md#telegram).

---

## Microsoft Teams

Posts an Adaptive Card to a Teams channel via an Incoming Webhook. Cards render with a colour-coded header, fact set, and result body.

### Setup

1. In Teams, open the channel → **Connectors** (⋯ menu → Connectors)
2. Find **Incoming Webhook** → **Configure**
3. Give it a name and upload an icon (optional)
4. Click **Create** and copy the **Webhook URL**

> **Modern Teams:** Microsoft is migrating from Connectors to **Workflows**. If Connectors aren't available in your tenant, use the Power Automate Workflows app instead: add the "Post to a channel when a webhook request is received" workflow and copy its URL.

### Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **Webhook URL** | ✅ | Teams Incoming Webhook URL (or Power Automate Workflow URL) |

### Message Format

Delivered as an Adaptive Card (version 1.4):

- **Header:** ✅ / ❌ with task/team run status
- **Fact Set:** Prompt/Task, Agent/Team, Status
- **Body:** Result text (monospace font)
- **Error:** Shown if the task failed

> **Truncation:** Results over 2,000 characters are truncated in the Teams card.

---

## Asana

Creates a new task in an Asana project when a CrewForm task or team run completes or fails.

### Setup

1. Go to [app.asana.com/0/my-apps](https://app.asana.com/0/my-apps) → **Create New Token** (Personal Access Token)
2. Copy the **PAT**
3. Find your **Project GID**:
   - Open the project in Asana
   - The URL contains the GID: `https://app.asana.com/0/<PROJECT_GID>/...`
   - Or use the Asana API: `GET https://app.asana.com/api/1.0/projects`

### Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **Personal Access Token** | ✅ | Asana PAT from your account settings |
| **Project GID** | ✅ | Numeric project ID from the Asana URL |

### Task Format

Each delivery creates an Asana task with:

- **Name:** `[CrewForm] <task title> — <status>`
- **Notes:** Event type, task/agent details, timestamp, and full result

> **Tip:** Use Asana rules to automatically assign, tag, or move created tasks to specific sections based on their name or status.

---

## Trello

Creates a new card (or updates an existing one) on a Trello board when a CrewForm task or team run completes or fails. Trello also supports **bidirectional integration** — cards moved to a trigger list can start agent tasks, and results are posted back as comments.

### Setup

1. Go to [trello.com/power-ups/admin](https://trello.com/power-ups/admin) → create or select a Power-Up to get your **API Key**
2. From the API key page, click the **Token** link to generate a token with read/write access
3. Find your **Board ID**:
   - Open the board in Trello
   - The URL contains the ID: `https://trello.com/b/<BOARD_ID>/...`
4. Find the **List ID** for the target list:
   - Use the Trello API: `GET https://api.trello.com/1/boards/<BOARD_ID>/lists?key=<KEY>&token=<TOKEN>`
   - Or use a browser extension like [Trello Card Numbers](https://chrome.google.com/webstore/detail/trello-card-numbers)
5. *(Optional)* Find a **Review List ID** — completed cards will be moved here automatically

### Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **API Key** | ✅ | Trello API key from the Power-Up admin page |
| **Token** | ✅ | Trello token with read/write access |
| **Board ID** | ✅ | Board short ID from the Trello URL |
| **Default List ID** | ✅ | List where new result cards are created |
| **Review List ID** | Optional | If set, cards are moved here after results are posted |

### Card Format

Each delivery creates a Trello card with:

- **Name:** `[CrewForm] <task title> — <status>`
- **Description:** Event type, task/agent details, timestamp, and full result

If a card mapping already exists (from an inbound Trello trigger), the result is posted as a **comment** on the existing card instead of creating a new one, and the card is moved to the Review list.

### Bidirectional Flow

When used with a [Trello Messaging Channel](./channels.md#trello), CrewForm supports a full round-trip:

1. **Inbound:** A card is created or moved to the trigger list → CrewForm creates a task
2. **Agent processes** the card's title/description as the prompt
3. **Outbound:** The agent result is posted as a comment on the original card → card moves to the Review list

> **Tip:** Set up two lists on your board — an "AI Work" list (trigger) and a "Review" list (review) — for a clean Kanban workflow with your AI agents.

---

## Delivery Logs

Every delivery attempt is logged. View logs in **Settings → Output Routes → [Route Name] → Logs**:

| Column | Description |
|--------|-------------|
| Timestamp | When delivery was attempted |
| Event | Which event triggered the delivery |
| Status | `success` or `failed` |
| HTTP Code | Response code from the destination |
| Error | Error message if delivery failed |

Logs are retained for 30 days.

---

## Self-Hosted Environment Variables

If you self-host CrewForm, no extra environment variables are needed for output routes — all credentials are stored in the database per-route. The task runner reads them at delivery time.

See the [Self-Hosting Guide](./self-hosting.md) for general environment setup.

---

## Notion

Creates a new page in a Notion database when a CrewForm task or team run completes or fails.

### Setup

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New Integration**
2. Give it a name (e.g. "CrewForm") and select your workspace
3. Copy the **Internal Integration Token** (starts with `ntn_...`)
4. In Notion, open the target database → **⋯ → Connections → Add connection** → select your integration

### Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **Integration Token** | ✅ | Notion Internal Integration Token |
| **Database ID** | ✅ | ID from the database URL: `notion.so/<DATABASE_ID>?v=...` |

### Page Format

Each delivery creates a Notion page with:
- **Title:** `[CrewForm] <task title> — <status>`
- **Content:** Event type, agent details, timestamp, and full result as text blocks

---

## GitHub Issues

Creates an issue in a GitHub repository when a CrewForm task or team run completes or fails.

### Setup

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token (classic)**
2. Select the `repo` scope
3. Copy the **Personal Access Token**

### Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **Personal Access Token** | ✅ | GitHub PAT with `repo` scope |
| **Repository** | ✅ | Format: `owner/repo` (e.g. `CrewForm/crewform`) |
| **Labels** | Optional | Comma-separated labels to apply (e.g. `ai-output, review`) |
| **Assignees** | Optional | Comma-separated GitHub usernames to assign |

### Issue Format

- **Title:** `[CrewForm] <task title> — <status>`
- **Body:** Event type, agent details, timestamp, and full result in Markdown

---

## Email (Resend)

Sends a styled HTML email via the [Resend](https://resend.com) API. Ideal for managed email delivery without configuring an SMTP server.

### Setup

1. Sign up at [resend.com](https://resend.com) and verify a sending domain
2. Go to **API Keys** → create a new key
3. Copy the **API Key**

### Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **API Key** | ✅ | Resend API key |
| **From Email** | ✅ | Verified sender address (e.g. `alerts@yourdomain.com`) |
| **To Email(s)** | ✅ | Comma-separated recipient addresses |
| **Subject Template** | Optional | Supports `{{title}}`, `{{status}}`, `{{agent}}` placeholders |

---

## SMTP Email

Sends email via any SMTP server using [nodemailer](https://nodemailer.com). Use this for self-hosted email or providers like Gmail SMTP, SendGrid, Mailgun, etc.

### Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **SMTP Host** | ✅ | SMTP server hostname (e.g. `smtp.gmail.com`) |
| **SMTP Port** | ✅ | Port number (typically `587` for TLS, `465` for SSL) |
| **Username** | ✅ | SMTP authentication username |
| **Password** | ✅ | SMTP authentication password or app password |
| **From Email** | ✅ | Sender email address |
| **To Email(s)** | ✅ | Comma-separated recipient addresses |
| **Subject Template** | Optional | Supports `{{title}}`, `{{status}}`, `{{agent}}` placeholders |

> **Gmail SMTP:** Use an App Password (not your regular password). Go to Google Account → Security → 2-Step Verification → App passwords.

---

## Linear

Creates an issue in Linear when a CrewForm task or team run completes or fails. Uses the Linear GraphQL API.

### Setup

1. Go to [linear.app/settings/api](https://linear.app/settings/api) → **Personal API keys** → create a key
2. Copy the **API Key**
3. Find your **Team Key** (the short prefix like `ENG`, `OPS` visible in issue IDs)

### Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **API Key** | ✅ | Linear Personal API key |
| **Team Key** | ✅ | Team identifier (e.g. `ENG`) |
| **Labels** | Optional | Comma-separated label names (matched against existing team labels) |

### Issue Format

- **Title:** `[CrewForm] <task title> — <status>`
- **Description:** Full result in Markdown with agent and event metadata

---

## Google Workspace

Google destinations use **OAuth 2.0** — you connect your Google account once per workspace, and CrewForm handles token refresh automatically.

### Setup (One-Time)

1. When creating a Google output route, click **Connect Google** in the configuration form
2. Sign in with your Google account and grant the requested permissions
3. CrewForm stores encrypted OAuth tokens — no API keys needed

> **Self-Hosted:** You must configure a Google Cloud project with OAuth credentials. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on both Supabase Edge Functions and the task runner. See the [Self-Hosting Guide](./self-hosting.md) for details.

### Google Sheets

Appends task results as new rows in a Google Spreadsheet.

| Field | Required | Description |
|-------|----------|-------------|
| **Spreadsheet ID** | ✅ | ID from the spreadsheet URL: `docs.google.com/spreadsheets/d/<ID>/edit` |
| **Sheet Name** | Optional | Target sheet tab (defaults to first sheet) |

Each delivery appends a row with: Timestamp, Event, Task Title, Agent, Status, Result.

### Gmail

Sends an email from your connected Google account.

| Field | Required | Description |
|-------|----------|-------------|
| **To Email(s)** | ✅ | Comma-separated recipient addresses |
| **Subject Template** | Optional | Supports `{{title}}`, `{{status}}`, `{{agent}}` placeholders |

Emails are sent as the authenticated Google user with a styled HTML template.

### Google Docs

Creates a new Google Document with the full agent output.

| Field | Required | Description |
|-------|----------|-------------|
| **Drive Folder ID** | Optional | Target folder from URL: `drive.google.com/drive/folders/<ID>`. Defaults to root. |

Each delivery creates a document named `[CrewForm] <task title> — <timestamp>` with the full result.

### Google Calendar

Creates a review event on your Google Calendar.

| Field | Required | Description |
|-------|----------|-------------|
| **Calendar ID** | Optional | Defaults to `primary`. Use a specific calendar ID for custom calendars. |
| **Duration (minutes)** | Optional | Event duration in minutes (default: 30) |

Events are scheduled 1 hour after task completion with the task title and result in the description.
