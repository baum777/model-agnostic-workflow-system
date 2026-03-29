---
name: journal-state-machine-review
description: Reviews journal state, archive, confirm, and restore flows in Sparkfined-Tradeapp.
version: 1.0.0
repo: Sparkfined-Tradeapp
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Keep the journal lifecycle consistent across backend, API shim, and client-facing flows.

## Trigger
Use when journal state, archive behavior, or confirmation flow changes.

## When to use
- Reviewing create/confirm/archive/restore/delete changes
- Auditing journal-insight behavior or auto-archive rules
- Checking state-machine transitions in tests

## When not to use
- Trading-only changes
- Reasoning routes that are not journal-related

## Required inputs
- `backend/src/domain/journal/*`
- `api/_lib/domain/journal/*`
- `api/journal/*`
- `backend/tests/integration/journal.spec.ts`

## Workflow
1. Identify the journal transition being changed.
2. Compare backend and API behavior for the same transition.
3. Check whether state-machine rules are preserved.
4. Note any transition that is inferred only from current naming or tests.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Journal transitions remain explicit
- Archive and restore flows preserve history
- Backend and API stay behaviorally aligned

## Repo grounding notes
- `backend/src/domain/journal/index.ts`
- `backend/src/domain/journal/stateMachine.ts`
- `backend/src/domain/journal/repo.ts`
- `api/_lib/domain/journal/repo.ts`
- `api/journal/index.ts`
- `api/journal/[id].ts`

