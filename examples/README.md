# Three reproducible workflows

Each example supplies fictional source material. Model wording varies; compare the documented output requirements rather than an exact text snapshot. No example needs web search or claims current market facts.

Build the CLI first (`npm --prefix cli ci && npm --prefix cli run build`). Run commands from the repository root. Sign in to the chosen native tool beforehand. For an API/Ollama agent, change `config.execution` to `{"kind":"api"}`, choose its model/provider and configure its API key or local endpoint.

## 1. Review a supplied patch

```bash
node cli/dist/cli.js run examples/local-review.json --input examples/fixtures/review.patch --json
```

Expected: cite `src/invite.ts`, identify missing authentication/workspace authorization and attacker-selected admin access, propose a fix, and distinguish observations from assumptions. Native execution is read-only; the example does not apply the patch.

## 2. Turn evidence into a product brief

```bash
node cli/dist/cli.js run examples/evidence-brief.json --input examples/fixtures/customer-notes.txt --json
```

Expected: three sequential steps extract evidence, prioritize opportunities, and write a brief. Every finding cites S1–S4; unsupported market size/pricing is unknown. This demonstrates native handoffs without CrewForm API keys.

## 3. Draft source-grounded release notes

```bash
node cli/dist/cli.js run examples/release-notes.json --input examples/fixtures/release-notes.txt --json
```

Expected: R1/R2 appear as completed, R3 remains planned without a delivery promise, and R4 appears as a limitation. Claude tools are disabled, so it uses only the supplied text. This creates a draft; it does not publish or send anything.

For ACP, change the agent/transport to Gemini or Copilot with `"transport":"acp"`, or install an approved Codex/Claude ACP adapter. See [local agent execution](../docs/local-agents.md) for permission and account limits.
