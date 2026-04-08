---
title: Chat Widget
description: Embed a chat widget on any website to let visitors talk to your CrewForm agents.
---

## Overview

The CrewForm Chat Widget lets you deploy any agent as an embeddable chat bubble on your website. Visitors can chat with your agent in real-time with **streaming responses** — no login required.

**Key features:**
- 🔥 **Real-time streaming** — responses stream in word-by-word via SSE
- 🎨 **Customizable themes** — light/dark mode, custom colors, position
- 🔒 **Domain restrictions** — whitelist which domains can use your widget
- ⚡ **Rate limiting** — configurable per-visitor message limits
- 💬 **Session memory** — conversation history persists across page reloads
- 🥷 **Shadow DOM** — zero CSS conflicts with your existing site

## Quick Start

### 1. Create a Widget

1. Go to **Settings → Chat Widget**
2. Click **New Widget**
3. Select the agent you want to power the chat
4. Configure the welcome message, theme, and allowed domains
5. Click **Create Widget**

### 2. Embed on Your Website

Copy the embed snippet and add it to your website's HTML:

```html
<script
  src="https://runner.crewform.tech/chat/widget.js"
  data-key="cf_chat_your_key_here"
  data-theme="light"
  data-position="bottom-right"
  async
></script>
```

Place this snippet just before the closing `</body>` tag.

### 3. Self-Hosted Setup

If you're self-hosting CrewForm, the widget JS is served directly from your task runner:

```html
<script
  src="https://your-task-runner-url/chat/widget.js"
  data-key="cf_chat_your_key_here"
  data-url="https://your-task-runner-url"
  async
></script>
```

## Configuration Options

### Script Tag Attributes

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `data-key` | ✅ | — | Your widget API key (`cf_chat_...`) |
| `data-theme` | ❌ | `light` | Theme mode: `light` or `dark` |
| `data-position` | ❌ | `bottom-right` | Bubble position: `bottom-right` or `bottom-left` |
| `data-url` | ❌ | `https://runner.crewform.tech` | Task runner URL (self-hosted only) |

### Programmatic API

For more control, use the JavaScript API:

```javascript
CrewFormChat.init({
  apiKey: 'cf_chat_your_key_here',
  baseUrl: 'https://runner.crewform.tech',
  theme: 'dark', // or { mode: 'dark', primaryColor: '#6bedb9' }
  position: 'bottom-right',
});
```

### Widget Settings

| Setting | Description |
|---------|-------------|
| **Agent** | Which agent powers the chat |
| **Welcome Message** | First message shown when the chat opens |
| **Placeholder Text** | Input field placeholder |
| **Allowed Domains** | Comma-separated list of domains allowed to use this widget. Empty = all domains |
| **Theme** | Light or Dark mode |
| **Primary Color** | Brand color for the bubble and user messages |
| **Position** | Bottom-right or bottom-left |
| **Rate Limit** | Max messages per visitor per hour (default: 20) |

## Security

### Domain Restrictions

When you specify allowed domains, the widget server checks the `Origin` header of every request. Only requests from whitelisted domains will be accepted.

**Examples:**
- `example.com` — allows `example.com` and `www.example.com`
- `*.example.com` — allows any subdomain of `example.com`
- Leave empty to allow all domains (not recommended for production)

### API Keys

Each widget gets a unique `cf_chat_` prefixed API key. This key is visible in the embed script, so **always configure domain restrictions** to prevent unauthorized usage.

You can **regenerate** the API key from Settings → Chat Widget if it's compromised. Note that existing deployments will stop working until the embed snippet is updated.

## How It Works

```
┌──────────────────┐    ┌──────────────┐    ┌─────────────┐
│  Your Website    │───▶│  Task Runner │───▶│  LLM API    │
│  (Chat Widget)   │◀───│  /chat/*     │◀───│  (Provider) │
│                  │ SSE│              │    │             │
└──────────────────┘    └──────────────┘    └─────────────┘
```

1. **Visitor opens the chat bubble** on your website
2. **Widget fetches config** from `/chat/config` (agent name, welcome message)
3. **Visitor sends a message** → `POST /chat/message`
4. **Task runner creates a task** assigned to the configured agent
5. **Agent processes the task** using the LLM provider
6. **Response streams back** via SSE to the widget
7. **Both messages are saved** to the chat session for continuity

## Troubleshooting

### Widget doesn't appear

- Check the browser console for errors
- Verify the `data-key` attribute matches your widget API key
- Ensure the widget is **active** (toggle in Settings → Chat Widget)

### "Origin not allowed" error

- Add your domain to the widget's **Allowed Domains** list
- Include both `example.com` and `www.example.com` if needed
- For local development, add `localhost`

### Messages fail to send

- Check that the task runner is running and accessible
- Verify the agent has a valid LLM provider key configured
- Check the rate limit — visitors are limited to the configured messages per hour

### CORS errors

- If self-hosting, ensure your reverse proxy (nginx/Caddy) passes CORS headers
- The task runner handles CORS automatically for `/chat/*` endpoints
