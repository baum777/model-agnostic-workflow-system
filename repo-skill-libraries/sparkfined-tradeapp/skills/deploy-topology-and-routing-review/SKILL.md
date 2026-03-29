---
name: deploy-topology-and-routing-review
description: Reviews Railway, Vercel, and route ownership in Sparkfined-Tradeapp.
version: 1.0.0
repo: Sparkfined-Tradeapp
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Verify that production traffic, build ownership, and route rewrites match the declared deployment model.

## Trigger
Use when deploy manifests, route rewrites, or service start commands change.

## When to use
- Reviewing `railway.toml` or `vercel.json`
- Checking backend start and health behavior
- Auditing deploy-time route ownership

## When not to use
- Pure domain logic changes
- Shared contract changes with no deploy effect

## Required inputs
- `railway.toml`
- `vercel.json`
- `backend/src/server.ts`
- `docs/DEPLOYMENT.md`

## Workflow
1. Map every deploy target to a concrete service or rewrite.
2. Check the backend start command and healthcheck path.
3. Confirm the frontend rewrite to the backend host remains intact.
4. Report any hidden dependency on a provider or environment variable.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Railway hosts the canonical backend
- Vercel serves the frontend and forwards `/api/*`
- Health checks point at the backend runtime

## Repo grounding notes
- `railway.toml`
- `vercel.json`
- `backend/src/server.ts`
- `backend/Dockerfile`
- `.github/workflows/deploy.yml`
- `docs/DEPLOYMENT.md`

