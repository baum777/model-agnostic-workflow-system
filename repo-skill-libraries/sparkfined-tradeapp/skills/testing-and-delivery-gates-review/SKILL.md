---
name: testing-and-delivery-gates-review
description: Reviews CI, PR checks, and release gates in Sparkfined-Tradeapp.
version: 1.0.0
repo: Sparkfined-Tradeapp
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Review the validation and delivery gates that keep the repo shippable across frontend, backend, API, and shared contracts.

## Trigger
Use when CI, PR checks, release scripts, or test coverage changes.

## When to use
- Checking GitHub workflows and local verification scripts
- Reviewing backend, API, or frontend test coverage
- Auditing release-readiness and PR gating behavior

## When not to use
- Small implementation tweaks with no test impact
- Pure docs edits

## Required inputs
- `.github/workflows/ci.yml`
- `.github/workflows/pr-checks.yml`
- `.github/workflows/deploy.yml`
- `backend/tests/*`
- `api/tests/*`
- `docs/QA.md`

## Workflow
1. Identify the gate that should block the change if it fails.
2. Compare the workflow to the local verification commands.
3. Check that the relevant tests cover the changed boundary.
4. Record any missing or inferred gate as a delivery risk.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- CI covers contract, runtime, and integration boundaries
- PR checks enforce ownership and metadata rules
- Release gates are consistent with the documented workflow

## Repo grounding notes
- `.github/workflows/ci.yml`
- `.github/workflows/pr-checks.yml`
- `.github/workflows/deploy.yml`
- `backend/tests/`
- `api/tests/`
- `playwright.config.ts`
- `docs/QA.md`
- `scripts/verify-doc-metadata.mjs`

