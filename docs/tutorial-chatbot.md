# Tutorial: Build a Customer Support Chatbot

Build a fully functional customer support chatbot in 10 minutes using CrewForm. By the end of this tutorial, your chatbot will answer customer questions using your company's knowledge base and respond via Slack, Discord, or Telegram.

## What You'll Build

A customer support agent that:
- Answers product questions using your uploaded documentation
- Maintains a professional, empathetic tone using a voice profile
- Delivers responses via your team's messaging channels
- Runs 24/7 without intervention

## Prerequisites

- A CrewForm account ([sign up free](https://app.crewform.tech))
- An LLM API key (OpenAI, Anthropic, or Google)
- Optionally: a Slack, Discord, or Telegram bot token

## Step 1: Add Your API Key

1. Go to **Settings → API Keys**
2. Click **Add Key** and select your provider (e.g., Anthropic)
3. Paste your API key and click **Save**

> Your key is encrypted with AES-256-GCM before storage and never stored in plaintext.

## Step 2: Create the Support Agent

1. Navigate to **Agents → New Agent**
2. Fill in the details:

| Field | Value |
|-------|-------|
| **Name** | Customer Support Bot |
| **Description** | Answers customer questions about our product using the knowledge base |
| **Model** | `claude-sonnet-4-20250514` (or your preferred model) |
| **Temperature** | 0.3 (lower = more consistent, factual answers) |

3. Write a system prompt:

```
You are a helpful customer support representative for our company.

Rules:
- Always be polite, empathetic, and professional
- Answer questions ONLY based on the knowledge base provided
- If you don't know the answer, say: "I don't have that information yet — let me connect you with our team at support@yourcompany.com"
- Keep responses concise (under 200 words)
- Use bullet points for multi-step instructions
- Never make up product features or pricing
```

4. Click **Create Agent**

## Step 3: Add a Knowledge Base

1. Open your agent → click the **Knowledge Base** tab
2. Click **Upload Documents**
3. Upload your product documentation, FAQ files, or help center content (text, markdown, or PDF)
4. CrewForm will automatically chunk your documents and create vector embeddings

> **Tip**: Upload your most-asked FAQ document first. You can always add more documents later.

## Step 4: Configure a Voice Profile

1. Click the **Voice Profile** tab on your agent
2. Select **Empathetic** as the tone preset
3. Add custom instructions:

```
Always refer to users as "you" (not "the user").
End every response with "Is there anything else I can help with?"
Use simple, jargon-free language.
```

4. Click **Save Voice Profile**

## Step 5: Test Your Agent

1. Go to **Tasks → New Task**
2. Select your Customer Support Bot
3. Enter a test question: *"How do I reset my password?"*
4. Click **Run Task**
5. Review the response — it should draw from your uploaded knowledge base

## Step 6: Connect a Messaging Channel (Optional)

### Slack
1. Go to **Settings → Channels → Slack**
2. Follow the OAuth flow to connect your Slack workspace
3. Configure which channel the bot listens in

### Discord
1. Go to **Settings → Channels → Discord**
2. Enter your Discord bot token
3. Select the guild and channels

### Telegram
1. Go to **Settings → Channels → Telegram**
2. Enter your bot token from [@BotFather](https://t.me/BotFather)

Once connected, customers can message your bot directly in the channel, and the agent responds automatically.

## Step 7: Set Up Output Routes

To also deliver responses to specific destinations:

1. Go to **Settings → Output Routes**
2. Add a webhook, Slack channel, or other destination
3. Open your agent → scroll to **Output Routes** → select the specific channels

## What's Next?

- **Scale up**: Create a [Pipeline Team](./pipeline-teams.md) with a triage agent that routes questions to specialized agents (billing, technical, general)
- **Add context**: Upload more documents to your knowledge base to improve answer coverage
- **Monitor**: Check the **Analytics** page for token usage, response times, and cost tracking
- **Publish as MCP tool**: [Publish your agent](./mcp-server-publishing.md) so Claude Desktop or Cursor can call it directly
