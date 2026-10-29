---
name: authorization-boundary-review
description: Review application authorization boundaries, session failure branches, and exposure-prone callback or serialization patterns from the principal matrix, session model, and repo evidence.
version: 1.0.0
classification: shared-with-local-inputs
requires_repo_inputs: true
produces_structured_output: true
safe_to_auto_run: true
owner: model-agnostic-workflow-system
metadata:
  author: baum777 <baum777@users.noreply.github.com>
status: extracted
---

# Authorization Boundary Review

## Trigger

Use this skill when an application's authorization model, session handling, or token flow needs a focused consumer-level boundary review before merge or release.

## When Not To Use

- Do not use for harness or runtime policy auditing; use the native `runtime-policy-auditor` skill.
- Do not use for secret storage, redaction, or provider-switch boundaries; use the native `secret-boundary-audit` skill.
- Do not use for API shape and compatibility review; use the native `api-contract-review` skill.
- Do not use to rotate, create, or test credentials; this review never touches live identity systems.

## Purpose

Focused authorization review: separate authentication from action authority, map tenant and resource checks, and expose session failure branches and exposure-prone callback or serialization patterns.

## Boundary Differentiation

- `runtime-policy-auditor` audits harness and runtime policy; this skill reviews application authorization.
- `secret-boundary-audit` covers secret storage and redaction; this skill covers principal and session authority.
- `api-contract-review` covers API shape and compatibility; this skill covers who may call what.

## Workflow

1. Separate authentication, role assignment, and action authority for each control point in the supplied principal/resource/action matrix.
2. Map resource-level and tenant-level checks for every principal, action, and object pair.
3. Trace refresh, logout, revocation, and default-deny branches through the owning policy and repo evidence.
4. Flag tokens or credentials transferred in redirect URL query parameters; require a server-side session or equivalent secure callback mechanism and cite the applicable OAuth security guidance.
5. Flag responses that serialize unprojected persistence objects, such as full user records including credential-hash-style fields; require explicit response DTO allowlists.
6. Specify cross-tenant and privilege-escalation probes as negative tests bound to the reviewed revision.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`
- `git-diff-explainer`
- `validate-repo-surface`

## Local Inputs

- repository root
- principal/resource/action matrix
- session and token flow description
- owning authorization policy or contract files

## Approval Mode

- read-only

## Provider Projections

- OpenAI/Codex: native
- Claude: adapter
- Qwen Code: adapter
- Kimi K2.5: adapter

## Eval Scaffolding

- routing
- schema conformance
- tool selection
- provider parity
- failure modes

## Output

- `PRINCIPALS`
- `SCOPES`
- `CONTROL POINTS`
- `NEGATIVE TESTS`
- `UNVERIFIED`

## Quality Checks

- deny unknown principals by default in every mapped branch
- never treat an authenticated principal as universally authorized
- do not create, read, or rotate credentials during the review
- keep confirmed control points distinct from inferred or unverified ones; unresolved branches go to `UNVERIFIED`
- cite exact file paths and policy revisions for every control point
