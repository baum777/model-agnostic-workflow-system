---
name: dominance-policy-review
description: Reviews Dominance Layer policy, approval gates, and risk tiers in Sparkfined-Tradeapp.
version: 1.0.0
repo: Sparkfined-Tradeapp
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Check that the governance layer keeps risky actions behind explicit policy, tiering, and approval gates.

## Trigger
Use when Dominance Layer code, policy rules, or approval logic changes.

## When to use
- Reviewing dominance policy or risk tier changes
- Auditing approval gates for large diffs or core engine work
- Checking the auto-correct loop and related quality gates

## When not to use
- UI-only changes
- Simple route additions with no governance effect

## Required inputs
- `backend/src/lib/dominance/*`
- `shared/contracts/sparkfined-dominance.ts`
- `docs/DOMINANCE_LAYER.md`

## Workflow
1. Determine the affected risk tier or approval reason.
2. Compare the code path to the documented governance policy.
3. Check whether auto-correct or quality gates still behave deterministically.
4. Flag any policy assumption that is only implied by current naming.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Approval reasons remain explicit
- Risk tiers map to documented policy
- Dominance behavior is traceable in code and docs

## Repo grounding notes
- `backend/src/lib/dominance/index.ts`
- `backend/src/lib/dominance/policyEngine.ts`
- `backend/src/lib/dominance/qualityGates.ts`
- `backend/src/lib/dominance/orchestrator.ts`
- `shared/contracts/sparkfined-dominance.ts`
- `docs/DOMINANCE_LAYER.md`

