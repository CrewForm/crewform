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
