---
name: fail-closed-write-policy-review
description: Reviews approval-gated write behavior, public guards, and safety checks for organoid_Symbionts.
version: 1.0.0
repo: organoid_Symbionts
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Verify that any outbound write path remains approval-gated, conservative, and aligned with the repo's public and safety boundaries.

## Trigger
Use when a change could cause posting, publishing, identity disclosure, or unsafe automation.

## When to use
- Reviewing write preflight behavior
- Auditing public-facing text gates
- Checking identity, consent, or safety logic before publication

## When not to use
- Read-only scoring or classification changes
- Deploy topology work without write behavior

## Required inputs
- `src/policy/postingPolicy.ts`
- `src/engagement/writePreflight.ts`
- `src/boundary/publicGuard.ts`
- `src/boundary/publicTextGuard.ts`

## Workflow
1. Identify every branch that can result in a write or disclosure.
2. Check the approval and consent gates in order.
3. Verify public text and identity guards are fail-closed.
4. Report any branch that relies on assumed operator intent.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Unsafe writes are blocked by default
- Public text is validated before release
- Identity disclosure behavior is deterministic

## Repo grounding notes
- `src/policy/postingPolicy.ts`
- `src/engagement/writePreflight.ts`
- `src/boundary/publicGuard.ts`
- `src/boundary/publicTextGuard.ts`
- `src/router/permissions.ts`
- `src/router/policyChecks.ts`
- `src/identity/truthResolver.ts`

