# Troubleshooting

Common issues and solutions for CrewForm Cloud and self-hosted deployments.

## Agent & Task Execution

### Agent task stays in "Pending" state

**Cause**: The task runner isn't running or can't connect to Supabase.

**Solution**:
1. Verify the task runner is running: check for `Task runner listening...` in the logs
2. Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the task runner's `.env`
3. For self-hosted: ensure the task runner container is healthy (`docker compose ps`)

### "No API key found for provider" error

**Cause**: The LLM provider key isn't configured or is incorrectly encrypted.

**Solution**:
1. Go to **Settings → API Keys**
2. Delete the existing key for the provider
3. Re-add the key (it will be re-encrypted with AES-256-GCM)

### Agent returns empty or truncated responses

**Cause**: Max tokens is set too low, or the model is hitting context limits.

**Solution**:
1. Open the agent → increase **Max Tokens** (try 4096)
2. If using a knowledge base with large documents, reduce chunk size
3. Try a model with a larger context window (e.g., `gemini-1.5-pro` at 1M tokens)

### Task fails with "Rate limit exceeded"

**Cause**: Too many requests to the LLM provider in a short time.

**Solution**:
1. Space out task executions
2. For pipeline teams, increase the delay between steps
3. Consider using a provider with higher rate limits (e.g., OpenRouter)
4. For Ollama local models: no rate limits apply

---

## Knowledge Base / RAG

### Documents not being found in knowledge search

**Cause**: Embeddings may not have been generated, or the query doesn't match the content semantically.

**Solution**:
1. Check the knowledge base page — documents should show "Indexed" status
2. Try rephrasing the query to match document language more closely
3. Upload more specific, focused documents rather than large general ones
4. Ensure the embedding model has finished processing (check task runner logs)

### "knowledge_search tool not found" error

**Cause**: The agent doesn't have a knowledge base attached.

**Solution**:
1. Open the agent → **Knowledge Base** tab
2. Upload at least one document
3. Re-run the task

---

## MCP Server Publishing

### Claude Desktop doesn't show CrewForm tools

**Solution**:
1. Verify your MCP config in Claude Desktop Settings → Developer → MCP Servers
2. Check the JSON syntax — common issue is missing commas or quotes
3. Restart Claude Desktop after any config change
4. Verify the MCP API key starts with `cf_mcp_`

### "Unauthorized" error when calling MCP tools

**Cause**: Invalid or expired MCP API key.

**Solution**:
1. Go to **Settings → MCP Servers**
2. Generate a new MCP API key
3. Update your client config with the new key

### Published agent not appearing in MCP tool list

**Solution**:
1. Open the agent — verify the **MCP Published** button is green
2. Check that the agent belongs to the same workspace as your MCP API key
3. Wait 10-15 seconds for the tool list to refresh

---

## Messaging Channels

### Discord bot not responding

**Solution**:
1. Verify the bot token in **Settings → Channels → Discord**
2. Check that the bot has been invited to the server with correct permissions (Send Messages, Read Message History)
3. Ensure the correct guild and channel are selected
4. Check task runner logs for connection errors

### Slack messages not triggering agents

**Solution**:
1. Re-authenticate the Slack OAuth connection in **Settings → Channels → Slack**
2. Verify the bot is added to the channel where you're sending messages
3. Check that the Slack app has the required scopes

### Telegram bot not responding

**Solution**:
1. Verify the bot token from [@BotFather](https://t.me/BotFather)
2. Make sure you've sent `/start` to your bot first
3. For group chats: the bot must be an admin or have group privacy disabled

---

## Self-Hosting (Docker)

### Container health check failing

**Solution**:
```bash
# Check container status
docker compose ps

# View logs for the failing container
docker compose logs app
docker compose logs task-runner

# Restart all containers
docker compose down && docker compose up -d
```

### Database migration errors

**Solution**:
1. Ensure you're running migrations in numeric order
2. Connect to your PostgreSQL instance and check which migrations have been applied
3. For fresh installs, run the migration script: `bash scripts/migrate.sh`

### "CORS error" or "Unable to fetch" in browser

**Cause**: Nginx proxy or environment variable misconfiguration.

**Solution**:
1. Check `APP_URL` in your `.env` matches the URL you're accessing
2. Verify nginx config routes `/api` and `/mcp` to the correct backend ports
3. For SSL: ensure certificates are valid and nginx is configured for HTTPS

### High memory usage / OOM crashes

**Solution**:
1. Add memory limits to `docker-compose.yml`:
```yaml
services:
  task-runner:
    deploy:
      resources:
        limits:
          memory: 2G
```
2. Reduce concurrent task execution in task runner config
3. Monitor with `docker stats`

---

## Observability & Tracing

### Langfuse traces not appearing

**Solution**:
1. Verify `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_HOST` are set in the task runner's `.env`
2. Check that `ENABLE_TRACING=true` is set
3. Allow 30-60 seconds for traces to appear in the Langfuse dashboard
4. Check task runner logs for Langfuse connection errors

### OpenTelemetry export failing

**Solution**:
1. Verify `OTEL_EXPORTER_OTLP_ENDPOINT` is correct
2. Ensure your collector (Jaeger, Grafana Tempo, Datadog) is running and accessible
3. Check firewall rules allow outbound connections to the OTLP endpoint

---

## Common Environment Issues

### "Missing environment variable" on startup

**Solution**:
1. Compare your `.env` against `.env.example` — new features may require new variables
2. After pulling updates, always check `.env.example` for new entries
3. Required variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ENCRYPTION_KEY`

### Different behavior between local and production

**Cause**: Environment variable differences.

**Solution**:
1. Compare `.env.local` (development) with your production `.env`
2. Ensure `VITE_APP_URL` points to the correct domain in production
3. Check that the task runner's `.env` has the correct production Supabase URL

---

## Still Need Help?

- **Discord**: Join our community at [discord.gg/TAFasJCTWs](https://discord.gg/TAFasJCTWs)
- **GitHub Issues**: [github.com/CrewForm/crewform/issues](https://github.com/CrewForm/crewform/issues)
- **Email**: [team@crewform.tech](mailto:team@crewform.tech)
