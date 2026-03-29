---
name: worker-loop-operability-review
description: Reviews the mention poller, timeline loop, and worker launch gates for organoid_Symbionts.
version: 1.0.0
repo: organoid_Symbionts
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Review the always-on worker path for liveness, gate ordering, and failure handling.

## Trigger
Use when worker startup, polling cadence, or loop control changes.

## When to use
- Inspecting `src/index.ts` or worker loop behavior
- Reviewing launch gates, leader locks, or poll scheduling
- Checking that worker failures fail closed instead of silently continuing

## When not to use
- Health-only changes with no worker effect
- Prompt assembly changes that do not touch polling

## Required inputs
- `src/index.ts`
- `src/worker/pollMentions.ts`
- `src/worker/pollTimelineEngagement.ts`
- `src/ops/launchGate.ts`

## Workflow
1. Trace startup from env validation to loop start.
2. Check lock ordering, cadence, and retry posture.
3. Look for unbounded write behavior or implicit retries.
4. Identify any loop assumption that is only inferred from logs.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Worker does not start before config validation
- Loop behavior is bounded and observable
- Launch gates are explicit, not implied

## Repo grounding notes
- `src/index.ts`
- `src/worker/pollMentions.ts`
- `src/worker/pollTimelineEngagement.ts`
- `src/ops/launchGate.ts`
- `src/ops/pollLock.ts`
- `scripts/poll_mentions.ts`

