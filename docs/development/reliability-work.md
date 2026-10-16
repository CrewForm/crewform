# Reliability and adoption work

The product goal is repeatable, inspectable workflows using agents developers
already have. MIT software and paid Cloud hosting are the distribution model.
Protocol support alone is not a differentiator; reliable execution and a useful
first result must demonstrate the value.

## Delivery order and acceptance criteria

| Work | Acceptance criteria | Status |
|---|---|---|
| First result | Account-free scripted walkthrough exercises actual pipeline handoffs; outputs clearly marked simulated; current full-stack setup instructions | Implemented in this branch |
| Setup diagnostics | Machine-readable runtime availability; no inference requests or credential output; installation does not imply authentication | Implemented in this branch |
| Stream interruptions | Preserve partial output; distinguish transport interruption from execution failure; no implicit retry; stale connection fencing and bounded parsing tests | Implemented in this branch |
| Pipeline recovery | Durable completed step outputs and configuration/input identity; continuation at committed boundaries; stale worker, cancellation and uncertain-effect tests | Implemented; migration 107 and matching runner required |
| Human decisions | Durable actor-bound approvals, expiry and cancellation; decisions visible with the run | Implemented for pipeline boundaries; approvals expire after 24 hours |
| Handoff contracts | Versioned schemas validated before downstream consumption across supported runtimes | Pending; offline demo validates its own fixed contracts only |
| Run history | Inputs, outputs, tools, decisions, attempts, delivery and recovery in one inspectable/exportable record | Committed outputs/decisions in run view; versioned authorized evidence export implemented |
| Personal-worker coordination | Per-step approved device selection; honest offline waiting, revocation and consent; no shared native accounts | After recovery and decisions |
| Scheduling consistency | Shared validated cron semantics and fixtures in runner and Edge scheduler | Pending |
| Published CLI | New immutable MIT package version, packaged offline smoke and accurate public installation docs | Version 0.3.0 prepared; publication requires npm authentication |
| Adoption evidence | Useful supplied-patch workflow; first-artifact and repeat-use measures only with explicit opt-in | Pending |

Each row needs its own implementation evidence. This checklist does not claim
the remaining capabilities have shipped. The scripted review pack demonstrates
handoff mechanics; it does not perform an AI review or post repository comments.

## Recovery constraints

An interrupted stream is not proof that execution failed. A completed step may
have external effects even if its result was never committed. Continuation must
reuse committed outputs, reject changed configuration/input and fence old attempts.
Uncertain in-flight effects require review rather than automatic replay. Native
usage remains unknown unless the runtime reports it. Cloud quotas and workspace
authorization continue to apply to recovered work.
