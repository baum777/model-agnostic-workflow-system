---
name: health-and-metrics-review
description: Reviews organoid_Symbionts health endpoints, glyph surfaces, and metrics payloads.
version: 1.0.0
repo: organoid_Symbionts
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Check the health and observability surfaces that operators use to decide whether the runtime is safe to keep running.

## Trigger
Use when health endpoints, metrics, glyph status, or readiness logic changes.

## When to use
- Reviewing `/health`, `/ready`, `/metrics`, or glyph output
- Verifying readiness against the current state store
- Auditing signal quality for alerts or dashboards

## When not to use
- Pure business logic changes with no observability effect
- Prompt edits that do not alter the HTTP surface

## Required inputs
- `src/server.ts`
- `src/observability/health.ts`
- `src/observability/metrics.ts`
- `src/observability/glyphStatus.ts`

## Workflow
1. Enumerate the exposed health and metrics endpoints.
2. Check the readiness criteria against the live state dependencies.
3. Verify metric and glyph names are stable and explainable.
4. Call out any degraded behavior that is intentional versus accidental.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Health endpoint is import-safe and side-effect controlled
- Readiness checks the actual store, not a stub assumption
- Metrics and glyph payloads are stable enough for operators

## Repo grounding notes
- `src/server.ts`
- `src/observability/health.ts`
- `src/observability/metrics.ts`
- `src/observability/glyphStatus.ts`
- `src/observability/pulseHeart.ts`
- `docs/operations/monitoring.md`

