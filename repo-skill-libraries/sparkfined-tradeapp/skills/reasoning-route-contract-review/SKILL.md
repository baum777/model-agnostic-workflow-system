---
name: reasoning-route-contract-review
description: Reviews reasoning prompts, schemas, and route contracts in Sparkfined-Tradeapp.
version: 1.0.0
repo: Sparkfined-Tradeapp
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Keep the reasoning API machine-parseable and aligned with the canonical prompt source of truth.

## Trigger
Use when trade-review, session-review, board-scenarios, or insight-critic behavior changes.

## When to use
- Reviewing reasoning route output shapes
- Checking prompt or schema changes
- Auditing backend and API parity for reasoning behavior

## When not to use
- Non-reasoning routes
- UI-only changes

## Required inputs
- `backend/src/routes/reasoning/*`
- `api/reasoning/*`
- `shared/contracts/reasoning-prompts.ts`
- `shared/contracts/http/envelope.ts`

## Workflow
1. Identify the reasoning route and its schema.
2. Confirm the prompt source is canonical and not duplicated.
3. Compare backend and API behavior for the same route.
4. Note any contract shape that is inferred from tests rather than docs.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Prompts remain strict JSON only
- Routes validate against documented schemas
- Backend and API implement the same reasoning contract

## Repo grounding notes
- `backend/src/routes/reasoning/index.ts`
- `backend/src/routes/reasoning/prompts.ts`
- `backend/src/routes/reasoning/schemas.ts`
- `api/reasoning/trade-review.ts`
- `api/reasoning/session-review.ts`
- `shared/contracts/reasoning-prompts.ts`

