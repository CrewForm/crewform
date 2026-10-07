# Use your existing local agents

CrewForm supports model APIs alongside installed agents. Local execution uses the native tool and its credential store; CrewForm does not collect provider OAuth tokens or offer its own Claude/ChatGPT subscription login.

| Agent | Transport | Install and authenticate |
|---|---|---|
| Codex | CLI (`codex exec --json`) | [Official Codex authentication](https://learn.chatgpt.com/docs/auth) |
| Claude Code | CLI (`claude -p`) | [Claude Code authentication](https://code.claude.com/docs/en/authentication) |
| Gemini CLI | Native ACP (`gemini --acp`) | [Gemini authentication](https://geminicli.com/docs/get-started/authentication/) |
| GitHub Copilot | Native ACP (`copilot --acp --stdio`) | [Copilot ACP server](https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server) |
| Codex | ACP adapter (`codex-acp`) | [Adapter maintained by Agent Client Protocol](https://github.com/agentclientprotocol/codex-acp) |
| Claude Code | ACP adapter (`claude-agent-acp`) | [ACP SDK adapter](https://github.com/agentclientprotocol/claude-agent-acp) |

The adapters must be installed separately; CrewForm never installs executables while processing a task. Verify the source of any adapter you install. Native ACP integrations and adapter versions can change independently of CrewForm.

Subscription eligibility, available models and quotas depend on your native account and the provider's current terms. Codex may authenticate using ChatGPT or API credentials. Claude's current [subscription update](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) keeps headless/SDK usage within subscription allowances, subject to its [integration conditions](https://code.claude.com/docs/en/legal-and-compliance). A native login can still select a billed API account; CrewForm labels its billing and usage **unknown**, rather than assuming it is free or subscription billed.

## Standalone CLI

Install the published [`@crewformhq/cli`](https://www.npmjs.com/package/@crewformhq/cli) package. Its executable is `crewform`; Node.js 20 or later is required.

```bash
npm install -g @crewformhq/cli
crewform doctor
crewform init --runtime codex --output codex.json
crewform run codex.json --input changes.txt --json
```

Supply the file or patch to review in `changes.txt`. For repository development, build from source with `npm --prefix cli ci` and `npm --prefix cli run build`, then invoke `node cli/dist/cli.js` instead of `crewform`.

For Claude use `--runtime claude`; Gemini/Copilot default to ACP. For Codex or Claude ACP, add `--transport acp`. The doctor checks versions without reading credentials or submitting prompts. Sign in using the native tool's own command before running a workflow.

Configuration is portable:

```json
{
  "name": "Local reviewer",
  "model": "default",
  "system_prompt": "Review only the supplied code. Cite file and line references.",
  "tools": [],
  "config": {
    "execution": {
      "kind": "external",
      "agent": "codex",
      "transport": "cli",
      "timeoutMs": 300000
    }
  }
}
```

The working directory is the CLI's current directory. Each invocation starts a fresh session; returned native session IDs are diagnostic metadata, not a promise of session resume. CLI chat sends accumulated conversation text. ACP currently uses the native default model; CLI transports accept an explicit model override. Local teams support pipeline mode only.

## Trusted self-hosted runner

Create or edit an agent and select its **Execution** option. Export/import preserves the execution settings. Configure the runner on the machine where the native tools are installed and signed in:

```dotenv
CREWFORM_EXTERNAL_AGENTS_ENABLED=true
CREWFORM_EXTERNAL_WORKSPACE_ID=your-workspace-uuid
CREWFORM_EXTERNAL_USER_ID=your-user-uuid
CREWFORM_EXTERNAL_CWD=/absolute/path/to/a/trusted/isolated/project
```

With the local bootstrap, add those settings to `.crewform-local/app.env`, stop the Compose runner, build `task-runner`, and run `node scripts/local-services.mjs runner`. Other deployments can set the variables through their service manager. The stock Docker image does not contain native agents or personal credentials.

Only tasks and team runs created by that user in that workspace may use the login. Missing configuration fails closed. A runner is a trusted backend with a service-role database key; do not give that key to browser clients, contributors or remote personal workers. For Cloud-to-laptop execution, use the separately deployed [personal worker](#personal-worker) rather than a privileged task runner. Personal workers never receive a service-role key.

## Permissions, errors and accounting

- Codex CLI uses its read-only sandbox. Claude CLI disables built-in tools, automatic hooks, slash commands and inherited MCP servers. Supply file contents as input for a Claude review.
- ACP advertises no filesystem/terminal client capabilities and refuses all permission requests. ACP is a protocol, **not an OS sandbox**: native agents may have their own tools and policies. Use a trusted account and an isolated directory/container appropriate to your agent. Unattended write approval is not supported in this version.
- CrewForm excludes provider API keys, database secrets and unrelated environment variables from native subprocesses. Native credential files stay under the native tool's control. Existing native settings and account policy still apply.
- Commands are allowlisted and spawned without a shell. Trusted operators may set absolute executable overrides such as `CREWFORM_CODEX_CLI_PATH` or `CREWFORM_GEMINI_ACP_PATH`; agent JSON cannot specify commands or directories.
- Timeout defaults to five minutes and is configurable from one second to one hour. Ctrl-C cancels CLI execution. Self-hosted workers poll the task/run cancellation state and terminate the native process group on Unix. Windows process-tree isolation requires an operator-provided sandbox.
- There is at most one active execution per native agent in a process. Parallel steps sharing that agent fail with a retry-later diagnostic. This limit does not coordinate separate machines/processes; run one dedicated worker for a personal account.
- Authentication failures, quota exhaustion and native errors never trigger automatic API fallback. Native pipeline calls are not automatically retried. Explicitly choose an API agent for subsequent work if you intend API spending.
- Structured results carry `usageKnown: false` and `billingModel: "unknown"`. Legacy numeric counters may be zero placeholders; they are not measured tokens or a zero-dollar assertion. Native usage records have null cost and explicit unknown metadata. Aggregate cost charts include API cost estimates only; they do not estimate subscription costs.

CrewForm's existing MCP/A2A/AG-UI interfaces serve different purposes. [ACP](https://agentclientprotocol.com/get-started/introduction) standardizes client-to-agent sessions, streaming and permissions; it does not provide a billing entitlement or replace A2A publishing.

Direct Sign in with ChatGPT token sharing, hosted personal-worker pairing, resumable ACP sessions, interactive permission approvals and automatic provider fallback are not implemented by this integration. They require separate authentication, entitlement and lifecycle work.

## Personal worker

CLI 0.2.0 adds a narrowly scoped laptop worker. Your CrewForm backend must have migrations 104–105 and the `personal-worker` Edge Function before pairing is available. Deployment of the feature is separate from installing the CLI.

1. Install and sign in to your native agent using its own supported login flow.
2. Create a CrewForm agent with the matching execution runtime.
3. Start pairing on your laptop:

```bash
npx @crewformhq/cli@0.2.0 connect --runtime codex:cli
```

For self-hosting, add `--api-url https://your-supabase-origin` and `--app-url https://your-crewform-app`. `--directory /absolute/private/directory` selects a local job root owned by you, with permissions 0700. Otherwise the worker uses `~/.crewform/worker-jobs`.

4. Open the approval URL printed in the terminal. In **Settings → Personal devices**, review the device name and runtime, select agents, and approve only a pairing you started. A code expires after ten minutes and can be exchanged once using the laptop's private proof.
5. In the approved agent's **Execution → Run on** field, select your personal device. Start the worker:

```bash
npx @crewformhq/cli@0.2.0 worker start
```

Only tasks you create as a signed-in user in that workspace can target your granted device. Workspace API keys, other members, teams, public widgets and model overrides cannot use that personal login. One device per user is supported initially; each grant lasts 30 days. Renew by revoking the old grant and pairing again. Credential rotation does not extend consent.

The device makes outbound HTTPS requests; no laptop port needs to be exposed. ACP remains local stdio. The device credential authorizes only the granted jobs and is stored in macOS Keychain where available, otherwise a private 0600 file at `~/.crewform/device.json`. Provider credentials remain with the installed agent.

Every job uses a fresh private directory. Inputs are limited to five files, 10 MiB per file and 20 MiB total. Cloud cannot choose executable paths, environment variables, local paths or working directories. Each run starts a fresh native session, lasts at most ten minutes, and uploads bounded output snapshots. Adapter-created files may be retained in that directory and are reported for your review; supplied inputs are removed after execution.

The UI shows online, busy, offline, expired and revoked devices. Queued work waits up to 15 minutes, with maintenance running once per minute. Active leases last 15 seconds. Cancellation, revocation, membership removal, suspension or heartbeat failure abort local execution within nine seconds while the worker and OS are responsive. A suspended machine cannot promise a wall-clock stop deadline; stale uploads are rejected when it resumes. Interrupted leases fail for review without automatically replaying effects or falling back to an API.

```bash
npx @crewformhq/cli@0.2.0 worker rotate
npx @crewformhq/cli@0.2.0 disconnect
```

An interrupted rotation retains a private recovery file. Run `worker rotate` again before starting to recover the same credential, without changing grant expiry. If the grant was already revoked or expired, revoke it in the dashboard and run `disconnect --forget` to remove local credentials before reconnecting. `--forget` alone does not revoke Cloud access.

Native account quota/authentication errors fail the task. Native billing stays unknown. Personal execution is recorded separately from managed compute; a hosted workflow run still consumes its workspace's run allowance.
