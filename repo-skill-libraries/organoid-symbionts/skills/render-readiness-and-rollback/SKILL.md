---
name: render-readiness-and-rollback
description: Reviews deploy readiness, runbook coverage, and rollback posture for organoid_Symbionts on Render.
version: 1.0.0
repo: organoid_Symbionts
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Check whether a deployment is ready to promote and whether the operator has a realistic rollback path if the runtime misbehaves.

## Trigger
Use before a Render promotion, a release cut, or any change to startup/health behavior.

## When to use
- Reviewing deploy check scripts and runbooks
- Checking health/readiness surfaces before rollout
- Synthesizing rollback steps from existing docs and scripts

## When not to use
- Small code changes that cannot affect release posture
- Pure documentation typo fixes

## Required inputs
- `scripts/deploy-check.ts`
- `scripts/symbiont-health-check.ts`
- `docs/operations/launch_runbook.md`
- `docs/operations/launch_checklist.md`

## Workflow
1. Confirm the deploy check exercises the same assumptions as the runtime entrypoint.
2. Inspect health and readiness expectations.
3. Derive a rollback sequence from the existing runbook material.
4. Report any missing go/no-go gate as a deploy risk.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Readiness probe exists and is meaningful
- Runbook references current entrypoints and config names
- Rollback steps can be executed without inventing new infrastructure

## Repo grounding notes
- `scripts/deploy-check.ts`
- `scripts/symbiont-health-check.ts`
- `docs/operations/launch_runbook.md`
- `docs/operations/launch_checklist.md`
- `docs/operations/runbook.md`
- `render.yaml`

