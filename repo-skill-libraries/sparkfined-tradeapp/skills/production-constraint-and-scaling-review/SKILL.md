---
name: production-constraint-and-scaling-review
description: Reviews launch constraints, cache rules, and scaling posture in Sparkfined-Tradeapp.
version: 1.0.0
repo: Sparkfined-Tradeapp
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Check the constraints that keep production behavior stable, especially around discover caching and instance scaling.

## Trigger
Use when deploy size, cache policy, or scaling assumptions change.

## When to use
- Auditing the discover token endpoint
- Checking launch or scaling notes in deployment docs
- Reviewing health targets and cache semantics

## When not to use
- Pure UI changes
- Reasoning prompt changes with no scaling effect

## Required inputs
- `docs/DEPLOYMENT.md`
- `docs/STABILITY_BASELINE.md`
- `backend/src/routes/health.ts`
- `backend/src/routes/index.ts`

## Workflow
1. Identify the constraint being protected.
2. Check whether the code still assumes single-instance or shared-cache behavior.
3. Compare the endpoint's behavior with the launch notes.
4. Mark any scaling assumption that is only inferred from cache implementation.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Discover cache behavior matches the documented launch constraint
- Health checks reflect the current production posture
- Scaling guidance is explicit and not hand-waved

## Repo grounding notes
- `docs/DEPLOYMENT.md`
- `docs/STABILITY_BASELINE.md`
- `backend/src/routes/health.ts`
- `backend/src/lib/discover/discoverService.ts`
- `backend/src/routes/index.ts`

