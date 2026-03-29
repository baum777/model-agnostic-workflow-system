---
name: state-store-and-migration-review
description: Reviews durable state, locks, and migrations for organoid_Symbionts.
version: 1.0.0
repo: organoid_Symbionts
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Review persistent state behavior so that cursor, lock, publish, and memory semantics stay durable and bounded.

## Trigger
Use when state persistence, lock semantics, or migrations are touched.

## When to use
- Auditing store abstraction changes
- Checking migration files or state schema drift
- Verifying failover between filesystem and Redis-backed state

## When not to use
- Stateless utility changes
- Prompt-only edits

## Required inputs
- `src/state/stateStore.ts`
- `src/state/storeFactory.ts`
- `src/state/migrations/*`
- `src/ops/pollLock.ts`

## Workflow
1. Trace the state operation being changed.
2. Check whether the backing store contract is preserved.
3. Review migration ordering and compatibility assumptions.
4. Identify any state behavior that is only implied by current tests.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Store methods preserve their documented semantics
- Migrations are ordered and additive
- Lock and cursor behavior is explicit

## Repo grounding notes
- `src/state/stateStore.ts`
- `src/state/storeFactory.ts`
- `src/state/migrations/001_initial_schema.sql`
- `src/state/migrations/002_command_dsl.sql`
- `src/state/migrations/003_audit_log.sql`
- `docs/operations/STATE_DATA_SEPARATION.md`

