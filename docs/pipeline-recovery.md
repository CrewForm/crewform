# Pipeline recovery and review

Apply migration **107** before deploying the matching runner/frontend. Older
runs without checkpoints retain their history and cannot use continuation.
Pipeline configurations support 1–100 steps.

## Saved boundaries

The runner saves the original team/agent configuration, input identity, file
versions, resolved file context and retrieved memory context. Each pipeline step
is marked in flight before dispatch. Its output (or configured skip) must commit
before downstream execution begins. A fan-out and its merge form one boundary;
individual branches cannot be resumed separately.

When continuing a run, completed steps are not called again. Their saved outputs
and reported usage are restored. Changed input, file versions, agent/team settings
or dependent tool/voice/template settings block continuation. The dependency
check is conservative: changes to those workspace settings can invalidate a run
even if a particular step did not use the changed record.

If a call was in flight when execution failed, its outcome is **uncertain**.
Inspect its messages and any external effects before creating a new run. CrewForm
does not replay that step through continuation. There is no exactly-once guarantee
for provider calls or external writes.

## Human approval

In the pipeline settings, enable **Pause for approval between steps** and save.
After a step commits, the run pauses. On the run page, inspect the saved output,
acknowledge review and choose **Approve and continue**. Decisions retain the actor,
time, step and checkpoint revision. Approval requests expire after 24 hours;
an expired request requires a new run after review. Cancellation always prevents
continuation.

The creator or a workspace owner/admin can continue an eligible run. Native-login
runs require the original creator; existing consent and runner ownership checks
still apply. The local standalone CLI rejects workflows requiring these durable
approvals. Paired laptop agents remain single-agent only; these checkpoints do
not add Cloud-to-laptop team dispatch.

## Evidence and limits

The run page shows committed outputs, uncertainty and continuation decisions.
**Export run evidence** downloads versioned JSON containing the input, step
results, activity/tool logs, decisions and authorized execution/delivery records.
Delivery visibility follows existing workspace permissions. Review prompts, model
outputs and tool logs for private data before sharing the file. Agent credentials
and download URLs are not added to the export.

Native usage is unknown when not reported; a zero internal accumulator is not a
promise of free execution. Checkpoint totals cover committed results, not unknown
usage from interrupted calls. Usage analytics are written after checkpoint commit;
if the runner dies in that small window, the checkpoint retains usage but a separate
analytics row may be missing. Continuation does not repeat the agent to repair it.

Existing hosting quotas, suspension, cancellation and execution-attempt fencing
remain authoritative. Do not roll an active checkpointed run back to a runner
version that ignores checkpoints. Stop execution and cancel pending continuations
before a binary rollback; keep checkpoint rows for investigation.
