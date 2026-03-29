---
name: testing-and-compliance-gates-review
description: Reviews test, simulation, and compliance gates for organoid_Symbionts.
version: 1.0.0
repo: organoid_Symbionts
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Review the validation surfaces that protect fail-closed behavior before a change reaches production.

## Trigger
Use when CI, test coverage, simulation, or compliance paths change.

## When to use
- Checking the repo's standard validation commands
- Reviewing simulation output or operator-facing compliance tests
- Auditing CI expectations against the actual test tree

## When not to use
- Runtime-only edits with no validation impact
- Deploy manifests without test changes

## Required inputs
- `vitest.config.ts`
- `.github/workflows/ci.yml`
- `tests/`
- `scripts/simulateConversation.ts`

## Workflow
1. Identify the validation command that should catch the change.
2. Check whether the relevant tests exist and are scoped correctly.
3. Verify the compliance path still matches the operator workflow.
4. Note any expected output that is inferred from the current test tree.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Validation command covers the changed boundary
- Operator-facing simulations remain deterministic enough to trust
- CI workflow still matches the runtime and deployment posture

## Repo grounding notes
- `vitest.config.ts`
- `.github/workflows/ci.yml`
- `tests/unit/`
- `tests/integration/`
- `tests/e2e/`
- `scripts/simulateConversation.ts`
- `scripts/deploy-check.ts`
- `scripts/symbiont-health-check.ts`

