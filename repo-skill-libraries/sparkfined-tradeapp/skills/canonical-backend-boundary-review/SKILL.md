---
name: canonical-backend-boundary-review
description: Reviews the canonical backend boundary against the frontend shell for Sparkfined-Tradeapp.
version: 1.0.0
repo: Sparkfined-Tradeapp
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Review the repo's main boundary: the frontend shell consumes the canonical backend over HTTP, while the backend owns server behavior.

## Trigger
Use when `src/` changes touch API ownership, route consumption, or backend ownership assumptions.

## When to use
- Reviewing frontend calls to the backend
- Checking whether a UI change accidentally assumes backend imports
- Auditing route ownership and store boundaries

## When not to use
- Backend-only implementation changes that do not affect the frontend boundary
- Deploy-target work unrelated to ownership

## Required inputs
- `src/`
- `backend/`
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`

## Workflow
1. Identify the client-side surface and the backend surface involved.
2. Check that the frontend uses HTTP boundaries rather than direct backend imports.
3. Confirm the backend remains the canonical owner for server semantics.
4. Call out any boundary assumption that is inferred rather than documented.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Backend remains canonical for server behavior
- Frontend state and service boundaries stay local to the SPA
- HTTP is the only cross-boundary contract

## Repo grounding notes
- `src/App.tsx`
- `src/routes/routes.ts`
- `src/services/api/client.ts`
- `src/services/*`
- `backend/src/app.ts`
- `backend/src/server.ts`
- `docs/ARCHITECTURE.md`

