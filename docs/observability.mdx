---
title: 'Observability'
description: 'Trace and debug multi-agent workflows with Langfuse, Datadog, Jaeger, and any OpenTelemetry backend'
---

## Overview

CrewForm's task runner supports **opt-in observability** via OpenTelemetry and Langfuse. When enabled, every task execution, LLM call, tool invocation, and team run is traced with span-level detail — giving you full visibility into multi-agent workflows.

<Info>Tracing is entirely opt-in. If no observability env vars are set, there is zero overhead — no SDK is loaded, no spans are emitted.</Info>

## Supported Backends

| Backend | Setup | Best For |
|---|---|---|
| **Langfuse** | `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` | AI-native observability with LLM generation tracking, cost analysis, prompt debugging |
| **Datadog** | `OTEL_EXPORTER_OTLP_ENDPOINT` | Enterprise APM with existing Datadog infrastructure |
| **Jaeger** | `OTEL_EXPORTER_OTLP_ENDPOINT` | Self-hosted open-source tracing |
| **Grafana Tempo** | `OTEL_EXPORTER_OTLP_ENDPOINT` | Grafana stack users |
| Any OTLP-compatible | `OTEL_EXPORTER_OTLP_ENDPOINT` | Any backend that accepts OTLP HTTP traces |

## Quick Start

### Langfuse (Recommended for AI Workloads)

Set these environment variables on your task runner:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com  # or your self-hosted URL
```

That's it. Restart the task runner and traces will appear in your Langfuse dashboard.

### Generic OTLP (Datadog, Jaeger, etc.)

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318  # Your OTLP collector
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer your-token  # Optional auth
```

## What Gets Traced

### Single Task Execution

```
Trace: task.execute
  ├── Generation: llm.call (model, provider, tokens, cost)
  ├── Span: mcp.discover (server_count, tool_count)
  ├── Generation: llm.tool_use_call (if tools enabled)
  └── attributes: task_id, agent_id, workspace_id
```

### Team Runs

```
Trace: team.run (team_id, mode)
  ├── Span: pipeline.execute
  │   └── (individual task traces nested within)
  ├── Span: orchestrator.execute
  │   └── (brain + delegate task traces)
  └── Span: collaboration.execute
      └── (turn-by-turn task traces)
```

### Attributes on Every Trace

| Attribute | Description |
|---|---|
| `crewform.workspace_id` | Workspace that owns the task |
| `crewform.task_id` | Unique task identifier |
| `crewform.agent_id` | Agent executing the task |
| `crewform.agent_name` | Agent display name |
| `crewform.team_id` | Team ID (for team runs) |
| `crewform.team_mode` | `pipeline`, `orchestrator`, or `collaboration` |
| `crewform.run_id` | Team run ID |

### LLM Generation Attributes (Langfuse)

In Langfuse, LLM calls appear as **Generations** with:

| Field | Description |
|---|---|
| `model` | Model identifier (e.g. `gpt-4o`, `claude-3.5-sonnet`) |
| `provider` | Provider name (e.g. `openai`, `anthropic`) |
| `promptTokens` | Input token count |
| `completionTokens` | Output token count |
| `totalTokens` | Total token count |
| `cost` | Estimated cost in USD |
| `input` | First 500 chars of the user prompt |
| `output` | First 500 chars of the result |

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `LANGFUSE_PUBLIC_KEY` | For Langfuse | Your Langfuse public key |
| `LANGFUSE_SECRET_KEY` | For Langfuse | Your Langfuse secret key |
| `LANGFUSE_BASE_URL` | No | Langfuse server URL (default: `https://cloud.langfuse.com`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | For OTLP | OTLP HTTP collector endpoint (e.g. `http://localhost:4318`) |
| `OTEL_EXPORTER_OTLP_HEADERS` | No | Auth headers for OTLP endpoint |

## Docker / Self-Hosted Setup

Add the env vars to your task runner service in `docker-compose.yml`:

```yaml
task-runner:
  environment:
    # Langfuse
    - LANGFUSE_PUBLIC_KEY=pk-lf-...
    - LANGFUSE_SECRET_KEY=sk-lf-...
    # Or OTLP
    # - OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
```

<Tip>For self-hosted Langfuse, you can run it alongside CrewForm in the same Docker Compose stack. See [langfuse.com/docs/deployment/self-host](https://langfuse.com/docs/deployment/self-host) for setup instructions.</Tip>

## Troubleshooting

### Traces Not Appearing

1. Verify env vars are set on the **task runner** process (not the web app)
2. Check task runner logs for `[Tracing] Langfuse client initialized` or `[Tracing] OTLP exporter initialized`
3. If you see `[Tracing] No observability env vars set`, the vars aren't reaching the process

### High Latency

Tracing adds minimal overhead (typically <1ms per span). If you notice latency:
- Ensure your OTLP collector is network-local to the task runner
- Langfuse batches traces automatically — no additional config needed
