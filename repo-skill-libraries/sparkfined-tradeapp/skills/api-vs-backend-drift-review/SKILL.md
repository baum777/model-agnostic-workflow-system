---
name: api-vs-backend-drift-review
description: Reviews Vercel API shim drift and production blocking rules in Sparkfined-Tradeapp.
version: 1.0.0
repo: Sparkfined-Tradeapp
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Prevent `api/` from drifting into ownership of endpoints that belong in the canonical backend.

## Trigger
Use when files under `api/` or the production route ownership rules change.

## When to use
- Reviewing new or modified `/api/*` routes
- Checking production blocking logic
- Auditing route ownership when a backend endpoint is added

## When not to use
- Backend-only route changes
- UI-only changes

## Required inputs
- `api/_lib/production-guard.ts`
- `api/_lib/handler.ts`
- `vercel.json`
- `scripts/verify-vercel-api-ownership.mjs`

## Workflow
1. Identify the route path and whether it is canonical or transitional.
2. Check the production guard blocklist and allowlist.
3. Confirm the Vercel rewrite path still routes to the canonical backend.
4. Flag any endpoint that is present in `api/` but should not own production traffic.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Core product endpoints are not owned by Vercel functions in production
- Transitional endpoints stay explicitly allowlisted
- Rewrites continue to point to the backend host

## Repo grounding notes
- `api/_lib/production-guard.ts`
- `api/_lib/handler.ts`
- `vercel.json`
- `scripts/verify-vercel-api-ownership.mjs`
- `backend/src/routes/index.ts`

