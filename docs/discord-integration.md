# Discord Integration

Connect a Discord server to CrewForm so users can trigger agents and pipeline teams directly from Discord using slash commands.

## How It Works

CrewForm's Discord integration uses a **slash command bot** registered in the Discord Developer Portal. Once connected, users can run:

| Command | Description |
|---------|-------------|
| `/connect code:<code>` | Link a Discord channel to a CrewForm output route |
| `/ask prompt:<question>` | Send a task to the connected agent or pipeline team |

Responses use Discord's **deferred message** pattern — Discord shows a "thinking…" indicator while CrewForm processes the request, then follows up with the result. This avoids Discord's 3-second response timeout.

---

## Setup: Managed Bot (Recommended)

The managed bot uses CrewForm's own Discord application. No separate bot registration needed.

### Step 1: Invite the Bot

Before connecting, invite the CrewForm bot to your Discord server:

1. Go to **Settings → Channels** in CrewForm
2. Click **Add Channel → Discord**
3. Click the **Invite Bot** link shown in the setup panel
4. Select your Discord server and authorise the bot (requires `Manage Server` permission)

> ⚠️ **The bot must be invited before you can use `/connect`.** If you skip this step, slash commands won't appear in your server.

### Step 2: Get Your Connect Code

1. In **Settings → Channels**, click **New Channel** and choose **Discord**
2. Toggle **Managed Bot** on
3. Optionally set a **Default Agent** or **Default Team** — this is what `/ask` will call
4. Save the channel — a **connect code** is generated

### Step 3: Connect the Discord Channel

In your Discord server:

```
/connect code:<your_connect_code>
```

You'll see a confirmation:

```
✅ Connected! Use `/ask prompt:<your question>` to send requests to your agent.
```

### Step 4: Test It

```
/ask prompt:Summarise the latest trends in AI tooling
```

CrewForm will show `⏳ Processing your request...` then follow up with the agent's response.

---

## Setup: Bring Your Own Bot (BYOB)

If you want full control over the Discord application (custom name, avatar, permissions), you can register your own bot.

### 1. Create a Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → give it a name (e.g., "My CrewForm Bot")
3. Go to **Bot** tab → click **Add Bot**
4. Copy the **Bot Token**
5. Go to **General Information** → copy the **Public Key**

### 2. Register Slash Commands

Run this once to register the `/connect` and `/ask` commands on your bot:

```bash
# Replace with your App ID and Bot Token
APP_ID="your_application_id"
BOT_TOKEN="your_bot_token"

curl -X POST "https://discord.com/api/v10/applications/${APP_ID}/commands" \
  -H "Authorization: Bot ${BOT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "connect",
    "description": "Link this Discord channel to CrewForm",
    "options": [{ "name": "code", "description": "Connect code from CrewForm", "type": 3, "required": true }]
  }'

curl -X POST "https://discord.com/api/v10/applications/${APP_ID}/commands" \
  -H "Authorization: Bot ${BOT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ask",
    "description": "Send a task to your CrewForm agent",
    "options": [{ "name": "prompt", "description": "Your question or task", "type": 3, "required": true }]
  }'
```

### 3. Set the Interactions Endpoint

1. In the Discord Developer Portal, go to **General Information**
2. Set **Interactions Endpoint URL** to:
   ```
   https://<your-supabase-project>.supabase.co/functions/v1/channel-discord
   ```
3. Click **Save** — Discord will ping the URL to verify Ed25519 signature verification

> ⚠️ Discord **requires** a valid `DISCORD_PUBLIC_KEY` environment variable on your Supabase project for this step to pass. Set it in your Supabase project's **Edge Function secrets** or your self-hosted `.env`.

### 4. Configure in CrewForm

In **Settings → Channels → New Channel → Discord**:
- Toggle **Managed Bot** OFF
- Paste your **Bot Token** and **Guild ID**
- Set a Default Agent or Team
- Invite your bot to your Discord server with the OAuth2 URL from the Developer Portal

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | Managed mode only | Token for the shared CrewForm bot |
| `DISCORD_PUBLIC_KEY` | BYOB mode (Ed25519 verification) | Public key from Discord Developer Portal |

For self-hosted deployments, add these to your `.env` file. See the [Self-Hosting Guide](./self-hosting.md).

---

## Troubleshooting

### `/connect` or `/ask` commands don't appear in my server

The bot hasn't been invited, or slash commands haven't been registered yet. Follow Steps 1–2 in the managed bot setup, or re-run the `curl` commands in the BYOB setup.

### "Invalid connect code" error

- Double-check the code from **Settings → Channels** — codes are single-use and expire if not used
- Ensure the channel platform is set to **Discord** in CrewForm

### "No agent configured" error

The channel's `/connect` was completed but no Default Agent or Default Team was assigned. Go to **Settings → Channels**, edit the channel, and set a default.

### Discord responds with 401 Unauthorized

The `DISCORD_PUBLIC_KEY` environment variable is missing or incorrect. Verify it matches the **Public Key** in your Discord Developer Portal → General Information.

### Responses time out or never arrive

CrewForm uses deferred responses — Discord shows "thinking…" while the task runs. If no followup arrives:
- Check task-runner logs: `docker compose logs -f task-runner`
- Ensure the task-runner has a valid LLM API key for the assigned agent's provider

---

## Related

- [Channels](./channels.md) — Overview of all inbound channels (Telegram, Slack, Email)
- [Output Routes](./output-routes.md) — Push agent results outbound to Discord and other destinations
