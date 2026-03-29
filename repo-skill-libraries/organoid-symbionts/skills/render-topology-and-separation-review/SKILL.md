---
name: render-topology-and-separation-review
description: Reviews worker, health, landing, and cron separation in organoid_Symbionts Render deployments.
version: 1.0.0
repo: organoid_Symbionts
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Verify that the repo keeps its runtime concerns separated: worker runtime, health HTTP surface, landing app, and scheduled jobs.

## Trigger
Use when service ownership or runtime boundaries might have drifted.

## When to use
- Reviewing a Render change that touches more than one service
- Checking the landing app against the worker runtime
- Auditing whether cron and health are still isolated from the poller loop

## When not to use
- A single-file logic change inside one worker module
- Prompt text edits that do not affect runtime topology

## Required inputs
- `render.yaml`
- `src/index.ts`
- `src/server.ts`
- `apps/landing/`

## Workflow
1. Identify each deployed service and its runtime role.
2. Confirm the landing app is not coupled to worker-only code paths.
3. Check that health and cron concerns stay separate from poller behavior.
4. List any separation assumptions that are inferred rather than explicit.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Worker service does not depend on landing app runtime
- Health service is import-safe and side-effect controlled
- Cron entrypoint is distinct from the always-on worker

## Repo grounding notes
- `render.yaml`
- `src/index.ts`
- `src/server.ts`
- `apps/landing/package.json`
- `apps/landing/src/`
- `docs/architecture/04-deployment.md`

