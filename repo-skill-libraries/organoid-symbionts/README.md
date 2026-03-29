# organoid_Symbionts Skill Library

This library was derived from the local `organoid_Symbionts` repo by reading the root README, `package.json`, `render.yaml`, the runtime entrypoints, health and observability code, prompt assets, state store code, tests, and the operator docs under `docs/`.

## Branch Structure

### 1. Render Deploy Branch

This branch exists because the repo has a real multi-service Render blueprint:

- worker
- health web service
- landing app
- daily cron

The Render branch holds the deploy-topology, env-contract, readiness, and rollback skills.

### 2. Runtime Control Branch

This branch covers the worker loop, fail-closed write policy, health and metrics, and durable state handling.

### 3. Prompt, Embodiment, and Signal Branch

This branch covers the canonical prompt fragments, embodiment routing, timeline engagement policy, and external read paths.

### 4. Validation and Derived Artifacts Branch

This branch covers testing, compliance, and semantic artifact regeneration so the runtime stays reproducible.

## Top Starter Skills

1. `render-blueprint-review`
2. `fail-closed-write-policy-review`
3. `health-and-metrics-review`
4. `testing-and-compliance-gates-review`
5. `prompt-canon-and-embodiment-review`

## Inferred Areas

- The lore layer is real, but the skill set treats it as an operational prompt and embodiment surface instead of assuming extra hidden runtime behavior.
- The semantic build and snippet extraction flows are real, but they are treated as derived-artifact maintenance, not as a separate product model.

## Why Render Got Its Own Branch

The deploy model is visible in `render.yaml`, and it matters operationally:

- worker and web health run separately
- landing is isolated from the worker runtime
- a cron job exists alongside the always-on services
- env variables differ by service

That is enough topology complexity to justify a dedicated branch rather than burying deploy review inside a generic ops skill.

