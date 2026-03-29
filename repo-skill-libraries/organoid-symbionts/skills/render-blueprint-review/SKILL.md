---
name: render-blueprint-review
description: Reviews the Render deployment blueprint, service graph, and command split for organoid_Symbionts.
version: 1.0.0
repo: organoid_Symbionts
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Review the Render blueprint as the primary production topology for the repo. This skill checks whether the worker, health service, landing app, and cron job are wired in a way that matches the runtime architecture.

## Trigger
Use when a change touches deploy config, service startup commands, or the worker/landing split.

## When to use
- Reviewing `render.yaml`
- Checking whether `pnpm build`, `node dist/index.js`, or landing commands still match the deployed topology
- Comparing service declarations against actual repo entrypoints

## When not to use
- Pure code logic changes that do not affect deploy or service topology
- Generic lint or formatting work

## Required inputs
- `render.yaml`
- `package.json`
- `apps/landing/package.json`
- `src/index.ts`
- `src/server.ts`
- `scripts/deploy-check.ts`
- `scripts/symbiont-health-check.ts`

## Workflow
1. Read `render.yaml` and the relevant package scripts.
2. Map each service to a concrete entrypoint and build command.
3. Check for topology drift, unsupported assumptions, or missing service separation.
4. Flag any deploy-time behavior that is only implied rather than explicitly declared.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Worker start command resolves to a built entrypoint
- Health service exposes the documented HTTP surface
- Landing app is isolated from the worker runtime
- Cron command points at a real script path

## Repo grounding notes
- `render.yaml`
- `package.json`
- `apps/landing/package.json`
- `src/index.ts`
- `src/server.ts`
- `scripts/deploy-check.ts`
- `scripts/symbiont-health-check.ts`

