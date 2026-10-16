# Personal devices in sequential pipelines

Apply migration **108** after 107, then deploy the matching runner and frontend.
The existing personal-worker Edge handler uses the same RPC entry points; their
database implementations now also support pipeline jobs.

## Setup

1. Create native agents for the runtimes you use. Pair and approve each agent in
   **Settings → Personal devices**, then select that device under the agent's
   **Run on** setting.
2. Add those agents to a sequential pipeline. API agents can appear between native
   steps. The device owner must create the run; another workspace member cannot
   use their login by referencing the same agent.
3. Enable **Pause for approval between steps** when you want to review each handoff.
4. Start the selected local worker profiles and run the team with supplied context.
   Inspect saved outputs, device state and continuation decisions on the run page.

Each profile is a separate approved device grant. CLI 0.3.0 supports multiple
profiles on the same laptop:

```bash
crewform --device-profile codex connect --runtime codex:cli
crewform --device-profile codex worker start

# Separate terminal, after signing in to Claude Code:
crewform --device-profile claude connect --runtime claude:cli
crewform --device-profile claude worker start
```

Until CLI 0.3.0 is published to npm, build it from this repository and replace
`crewform` with `node cli/dist/cli.js`. The default profile preserves the existing
`~/.crewform/device.json`; named profiles use private directories under
`~/.crewform/profiles/`. Profiles do not change the installed agent's login store.
Never share a profile's credential or mount a personal login into a shared worker.

Up to six active profiles are allowed per user. Each grant remains limited to
its approved workspace, agent IDs and runtime, and expires after 30 days. Only
one valid native job per owner and agent family can be leased across profiles,
transports and workspaces. For example, Codex CLI and Codex ACP share that limit.

## Execution and recovery

The managed runner queues a supplied-context job for the selected device. It does
not start a native login on the Cloud server. The job binds the parent run attempt,
step, approved agent snapshot and device grant. Claims, heartbeats, file downloads
and result writes recheck authority and input consent. Files remain scoped to that
run and are copied into a fresh private local job directory by the worker.

Offline jobs wait for the selected profile. Queues wait at most 15 minutes, and the
parent execution timeout may end the wait sooner. There is no API fallback. A
job that never received a native lease can be cancelled at a safe boundary; a
human can then explicitly continue. Once a lease was issued, an interrupted result
is uncertain and cannot be replayed through continuation. Lease expiry, revocation,
workspace suspension, cancellation and changed consent stop further accepted work.
Stopping the native process follows the existing worker heartbeat/termination bounds.
Native failures stop the pipeline even when a step was configured to skip or retry.

Native usage and cost remain unknown when not reported. A step uses its parent
workflow's hosting reservation rather than charging another hosted run. Provider
account limits and eligibility still apply to each actual native call.

## Limits and evidence

- Sequential pipeline steps only. Paired-device fan-out, orchestrator and
  collaboration modes are not supported; paired fan-out fails before dispatch.
- Workspace API keys, scheduled system jobs and public widgets cannot authorize
  another person's native login. A signed-in owner must initiate the native run.
- Supplied prompt and system context are each limited to 20,000 UTF-8 bytes.
  Existing worker limits still apply: five files, 10 MiB per file and 20 MiB total;
  bounded result streaming and 15-second execution leases.
- Device output is shown on demand, including uncommitted partial output. A native
  result must still pass its step contract before downstream use and checkpointing.
- Evidence exports include authorized personal-job attempts, states and outputs.
  Review private content before sharing them.

Local protocol fixtures cover two approved profiles, Codex CLI → Claude ACP,
private file delivery, human approval, native consent and one hosting reservation.
They do not certify subscription eligibility or every installed adapter version.
