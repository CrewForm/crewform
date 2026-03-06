# Channels (Inbound Messaging)

Channels let users trigger CrewForm agents and teams directly from messaging platforms. Send a message — CrewForm creates a task, runs the agent, and replies in the same conversation.

Supported platforms:

| Platform | Trigger method | Reply method |
|----------|---------------|-------------|
| [Telegram](#telegram) | Any message or `/ask` | Bot reply in the same chat |
| [Slack](#slack) | Any message in the connected channel | Thread reply |
| [Discord](./discord-integration.md) | `/ask` slash command | Follow-up message (deferred) |
| [Email](#email) | Email to a dedicated inbound address | Reply email via Resend |

---

## How Channels Work

Each channel is a **two-way bridge** between a messaging platform and a CrewForm agent or team:

```
User sends message
       │
       ▼
Platform webhook → CrewForm Edge Function
       │
       ▼
Task / Team Run created (status: dispatched)
       │
       ▼
Task Runner picks up → Agent executes
       │
       ▼
Result sent back to originating chat
```

Channels are separate from [Output Routes](./output-routes.md). Output routes push results to destinations proactively; channels are two-way — they accept inbound messages *and* send replies back to the originating conversation.

---

## Managed Bot vs Bring Your Own Bot (BYOB)

All channel platforms (except Email) support two modes:

### Managed Bot
CrewForm hosts and operates the bot. You connect your chat to it using a **connect code** generated in Settings. Fast to set up — no bot registration needed.

Requires `TELEGRAM_BOT_TOKEN`, `SLACK_BOT_TOKEN`, or `DISCORD_BOT_TOKEN` to be set in your Supabase Edge Function secrets (or `.env` for self-hosted). These are set by default in the CrewForm cloud.

### Bring Your Own Bot (BYOB)
Register your own bot application, paste its credentials into CrewForm, and CrewForm uses your bot instead. Full control over name, avatar, and permissions. Required if your org policy prohibits third-party bots.

---

## Telegram

### Managed Bot Setup

1. **Create the channel** in CrewForm:
   - Go to **Settings → Channels → New Channel → Telegram**
   - Toggle **Managed Bot** ON
   - Set a **Default Agent** or **Default Team**
   - Save — a **connect code** is generated

2. **Link your Telegram chat:**
   - Open the chat, group, or channel in Telegram
   - Send: `/connect <your_connect_code>`
   - The bot replies: `✅ Connected! Messages in this chat will be routed to your configured agent.`

3. **Send tasks:**
   - Any text message is routed to the agent
   - Or use `/ask <prompt>` to be explicit

### BYOB Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) → `/newbot` → copy the **Bot Token**
2. In CrewForm: **Settings → Channels → New Channel → Telegram**
3. Toggle **Managed Bot** OFF
4. Paste the **Bot Token** and your **Chat ID**
5. Set the **Webhook URL** on your bot:
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://<your-supabase-project>.supabase.co/functions/v1/channel-telegram"
   ```

### How Messages Are Handled

| Message | Behaviour |
|---------|-----------|
| `/connect <code>` | Links the chat to the CrewForm channel |
| `/ask <prompt>` | Routes the prompt to the configured agent/team |
| Any other text | Routed to the configured agent/team |
| Other `/commands` | Ignored silently |

The bot sends a **typing indicator** (`...`) while the task is being processed, then replies with the result in the same chat.

### Required Environment Variables (Self-Hosted)

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Managed bot token (for managed mode) |

---

## Slack

### Managed Bot Setup

1. **Create the channel** in CrewForm:
   - Go to **Settings → Channels → New Channel → Slack**
   - Toggle **Managed Bot** ON
   - Set a **Default Agent** or **Default Team**
   - Save — a **connect code** is generated

2. **Invite the bot to your Slack channel:**
   - In Slack, type `/invite @CrewForm` in the target channel

3. **Link the Slack channel:**
   - In the Slack channel, send: `connect <your_connect_code>`
   - The bot replies: `✅ Connected! Messages in this channel will now be routed to your configured agent.`

4. **Send tasks:**
   - Any message in the channel is routed to the agent

### BYOB Setup

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Enable **Event Subscriptions** and add `message.channels` (or `message.groups` for private channels) under **Subscribe to bot events**
3. Set the **Request URL** to:
   ```
   https://<your-supabase-project>.supabase.co/functions/v1/channel-slack
   ```
   Slack will send a `url_verification` challenge — CrewForm responds to it automatically.
4. Go to **OAuth & Permissions** → add scopes: `chat:write`, `reactions:add`, `channels:history`
5. Install the app to your workspace and copy the **Bot User OAuth Token** (`xoxb-...`)
6. In CrewForm: **Settings → Channels → New Channel → Slack**
   - Toggle **Managed Bot** OFF
   - Paste the **Bot Token** and **Channel ID**

### How Messages Are Handled

| Message | Behaviour |
|---------|-----------|
| `connect <code>` | Links the Slack channel to CrewForm |
| Any other message | Routed to the configured agent/team |
| Bot messages | Ignored (prevents loops) |

When a task is received, the bot reacts to the message with ⏳ (`:hourglass_flowing_sand:`) to indicate processing. When the task completes, the result is posted as a **thread reply** to the original message.

### Required Environment Variables (Self-Hosted)

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Managed bot token (for managed mode) |

---

## Discord

Discord channels use slash commands (`/connect` and `/ask`) instead of plain text triggers.

Full setup instructions are in the dedicated **[Discord Integration guide](./discord-integration.md)**, covering:
- Managed bot flow (invite → connect code → `/connect` → `/ask`)
- BYOB flow (custom Discord app, Ed25519 signature verification, slash command registration)
- Deferred responses and the "thinking…" indicator
- Troubleshooting

### Required Environment Variables (Self-Hosted)

| Variable | Description |
|----------|-------------|
| `DISCORD_BOT_TOKEN` | Managed bot token |
| `DISCORD_PUBLIC_KEY` | Ed25519 public key for signature verification |

---

## Email

Email channels accept inbound emails and route them as tasks to a configured agent or team. Replies are sent back to the sender via [Resend](https://resend.com).

### How It Works

1. Emails arrive at a dedicated inbound address (e.g. `agent@mail.yourapp.com`)
2. Resend receives the email and fires an `email.received` webhook to CrewForm
3. CrewForm fetches the email body via the Resend API, creates a task, and runs the agent
4. The agent's result is sent back as a reply email to the original sender

### Setup

#### 1. Configure Resend Inbound

1. Sign up at [resend.com](https://resend.com) and add your domain
2. Add an MX record to your domain DNS:
   ```
   Type: MX
   Name: mail  (or your inbound subdomain)
   Value: inbound-smtp.us-east-1.resend.com
   Priority: 10
   TTL: 300
   ```
   This routes emails sent to `@mail.yourdomain.com` through Resend.

3. In the Resend dashboard → **Inbound** → **Add Webhook**:
   - Event: `email.received`
   - URL:
     ```
     https://<your-supabase-project>.supabase.co/functions/v1/channel-email
     ```

#### 2. Create the Channel in CrewForm

1. Go to **Settings → Channels → New Channel → Email**
2. Set the **Inbound Address** — the full email address or prefix that should trigger this channel (e.g. `agent@mail.yourdomain.com`)
3. Set a **Default Agent** or **Default Team**
4. Save

Emails sent to the configured inbound address are now routed to your agent.

#### 3. Configure Reply Sending

Set these as Supabase Edge Function secrets (or `.env` for self-hosted):

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Your Resend API key (for fetching email bodies and sending replies) |
| `RESEND_FROM_ADDRESS` | Reply-from address, e.g. `CrewForm <noreply@crewform.tech>` |

### How Emails Are Processed

| Email content | Used as |
|--------------|---------|
| Subject | Task title (also included in the prompt) |
| Plain text body | Prompt body |
| HTML body (fallback) | HTML tags stripped, plain text used |
| To address | Matched against configured `inbound_address` |

> **Attachments:** Email attachments are not currently included in the agent prompt. Only the subject and body are used.

### Reply Format

The agent's result is sent back as an email reply:

- **From:** `RESEND_FROM_ADDRESS`
- **To:** Original sender
- **Subject:** `Re: <original subject>`
- **Body:** Agent result in a styled HTML block

Results over 10,000 characters are truncated in the reply email.

### Routing Multiple Agents

You can create multiple email channels with different inbound addresses to route different types of emails to different agents:

| Inbound Address | Agent |
|----------------|-------|
| `support@mail.yourdomain.com` | Support Triage Agent |
| `research@mail.yourdomain.com` | Research Analyst |
| `report@mail.yourdomain.com` | Report Generator |

### Required Environment Variables (Self-Hosted)

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key (fetching bodies + sending replies) |
| `RESEND_FROM_ADDRESS` | Sender address for reply emails |

---

## Message Log

All inbound and outbound channel messages are logged. View them in **Settings → Channels → [Channel Name] → Message Log**:

| Column | Description |
|--------|-------------|
| Direction | Inbound (user → CrewForm) or Outbound (CrewForm → user) |
| Preview | First 200 characters of the message |
| Task / Run | Link to the associated task or team run |
| Status | `delivered` or `failed` |
| Timestamp | When the message was sent or received |

---

## Choosing Managed Bot vs BYOB

| | Managed Bot | BYOB |
|--|-------------|------|
| **Setup time** | ~2 minutes | 15–30 minutes |
| **Bot name/avatar** | CrewForm branded | Fully customisable |
| **Token management** | Handled by CrewForm | You manage the bot |
| **Works for self-hosted?** | Requires env var set | ✅ Full control |
| **Multi-workspace** | Shared bot | Dedicated per workspace |

For most teams, Managed Bot is the right starting point. Switch to BYOB if you need a branded bot, organisation-specific permissions, or if your team policy requires it.
