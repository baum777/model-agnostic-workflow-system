---
name: vercel-deployment
description: Prepare, validate, and complete a Vercel deployment for Next.js or Node.js repos with API routes, runtime env vars, and production build checks.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: false
owner: codex-workflow-core
status: extracted
---

# Vercel Deployment

## Trigger

Use this skill when a repo needs Vercel preparation, a production deployment, or deployment triage involving Next.js, Node.js, API routes, or environment variables.

## When Not To Use

- Do not use for static-only hosting unless the repo truth proves no server runtime or secret-backed code is needed.
- Do not use to change product scope or switch providers.
- Do not use when the request is only local development setup.
- Do not use to claim production readiness without a successful Vercel link/build/deploy evidence path.

## Non-Goals

- This skill does not redesign the app.
- This skill does not assume env vars exist or are correct.
- This skill does not treat a local build as a completed deploy.
- This skill does not normalize away server/runtime requirements.

## Workflow

1. Inspect repo truth first: `package.json`, `next.config.*`, `vercel.json`, `.vercel/`, `.env.example`, docs, and any handover or intake notes.
2. Identify whether the app is static-only or server-capable.
3. Validate the scripts that matter: `dev`, `build`, `start`, `lint`, and `typecheck` when present.
4. Split environment variables into public/non-secret and secret/server-only sets.
5. Link the repo with `vercel` or `vercel link` before deployment-specific commands; the project binding lives under `.vercel/` once linked.
6. Check and pull env vars with `vercel env ls`, `vercel env pull`, or `vercel env run -- <command>` as needed.
7. Use `vercel build --prod` to verify the production build path when prebuilt output matters.
8. Use `vercel --prod` only after the build and env checks pass.
9. Verify the deployed URL and smoke test the expected routes and runtime behavior.
10. If env vars changed, require a new deployment before treating the state as current.

## Tool Requirements

- `vercel`
- `vercel link`
- `vercel env ls`
- `vercel env pull`
- `vercel env run`
- `vercel build --prod`
- `vercel --prod`

## Approval Mode

- explicit approval for remote-state changes, including deploys and env mutations

## Provider Projections

- Vercel: native
- Next.js: native runtime target
- Node.js: native server runtime target

## Eval Scaffolding

- repo surface
- script parity
- env inventory
- deploy gating
- smoke test

## Output

Use these headings:

- `SUMMARY`
- `OBSERVED TRUTH`
- `ENV INVENTORY`
- `DEPLOYMENT GATES`
- `NEXT ACTION`
- `OPEN GAPS`

## Quality Checks

- separate verified facts from assumptions
- fail closed if the repo cannot prove its runtime shape
- do not say deployment succeeded without Vercel evidence
- require a redeploy after any environment variable change

## References

- `docs/usage.md`
- `docs/validation-checklist.md`
- `docs/authority-matrix.md`
- official Vercel docs for `vercel link`, deployment, and environment variables
