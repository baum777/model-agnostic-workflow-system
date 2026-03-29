---
name: render-env-contract-validation
description: Validates environment variable contracts across organoid_Symbionts runtime code, examples, and Render deployment config.
version: 1.0.0
repo: organoid_Symbionts
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Check that runtime env requirements, defaults, and service-specific secrets are aligned across the codebase and the Render blueprint.

## Trigger
Use when `.env` templates, env schema, or Render secrets change.

## When to use
- Comparing env schema against deployment config
- Reviewing a production secret or provider change
- Verifying a new variable is represented in the correct service scope

## When not to use
- Changes that do not touch configuration or service startup
- Pure runtime logic edits with no env impact

## Required inputs
- `src/config/envSchema.ts`
- `src/config/env.ts`
- `.env.example`
- `.env.oauth2.example`
- `render.yaml`
- `scripts/README.oauth2-render-integration.md`

## Workflow
1. Compare the env schema to the Render service env declarations.
2. Confirm required secrets are present only where the service actually needs them.
3. Check for unsafe defaults, missing validation, or conflicting variable names.
4. Note anything that is inferred rather than explicitly documented.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Required secrets are fail-fast validated
- Optional variables have conservative defaults
- Service-scoped variables do not leak across unrelated Render services

## Repo grounding notes
- `src/config/envSchema.ts`
- `src/config/env.ts`
- `.env.example`
- `.env.oauth2.example`
- `render.yaml`
- `scripts/README.oauth2-render-integration.md`

