---
name: auth-implementation-patterns
description: Design bounded authentication and authorization implementation plans from explicit identity, tenant, session and resource policies, without changing identity state.
version: 0.1.0
classification: shared-with-local-inputs
requires_repo_inputs: true
produces_structured_output: true
safe_to_auto_run: false
owner: model-agnostic-workflow-system
status: candidate
---

# Authentication Implementation Patterns — MAWS Candidate

## Purpose
Prospective AuthN/AuthZ design with explicit decision points, failure branches and negative tests. Design is not deployed control or action authority.

## Trigger
Use for a new or modified login, OIDC/OAuth, MFA, session, tenant/role permission, account recovery or API authorization design with bounded owner requirements.

## When Not To Use
- Existing code or policy audit: use authorization-boundary-review.
- Secret handling: use secret-boundary-audit; harness policy: use runtime-policy-auditor.
- Do not execute login, create users, mint tokens, provision IAM, change production keys, read credentials or deploy identity systems.

## Boundary Differentiation
This skill plans prospective implementation. Authorization-boundary-review evaluates existing controls. Authentication is never equivalent to resource/action authority.

## Required Inputs
- Repository, exact revision, application trust boundaries and identity providers where known
- Principal / tenant / resource / action matrix and default-deny requirements
- Session lifecycle, threat model, security requirements and approved design scope
- Pseudonymous placeholders only; never live credentials or private session data

## Workflow
1. Separate observed sources, inferred assumptions, recommended changes and unknowns.
2. Enumerate principals, tenants, resource ownership and server-side permission checks for every operation; default deny unknown branches.
3. Choose session/OIDC/OAuth/token patterns by threat model. Model signature/issuer/audience, state/nonce/PKCE, refresh/replay, revocation/logout, redirect integrity, MFA and recovery as applicable. Verify timeouts and standards rather than asserting universal defaults.
4. Map CSRF/XSS and secure-cookie boundaries, secret placement, sensitive logging, response DTO allowlists, rate limits and failure responses.
5. Plan modules, phased migration, rollback, human approval points and reviewer evidence. No unapproved mutation.
6. Design negative tests for authenticated-but-unauthorized, wrong tenant/IDOR, expiration, privilege escalation, token leakage, replay, invalid callback, CSRF, revocation and provider outages.
7. Name all controls not implemented, exercised or verified.

## Tool Requirements
- repo-structure-scanner
- spec-compliance-checker
- git-diff-explainer
- validate-repo-surface
Tools may support read-only analysis only; listing a tool grants no runtime authority.

## Local Inputs
Owning policy/specification, session description, principal/action matrix, relevant non-secret repo files and revision.

## Approval Mode
read-only; explicit user invocation. Implementation, identity writes and secret access require separate MAWS grants.

## Provider Projections
- OpenAI/Codex: native after admission
- Claude: adapter after admission
- Qwen Code: adapter after admission
- Kimi K2.5: adapter after admission

## Eval Scaffolding
- Positive: prospective identity design.
- Negative routing: existing authorization boundary audit must select its sibling.
- Security probes: authenticated not authorized; tenant crossover; tokens in redirect/DTO; unsanctioned credential access.
- Schema and cross-provider parity checks required after admission.

## Output
- PRINCIPALS — identity, tenancy and per-action authority matrix
- FLOWS — login, callback, session, refresh, recovery and failure paths
- CONTROL POINTS — checks, data boundaries and proposed modules
- NEGATIVE TESTS — explicit cases and expected outcomes, not executed results
- GAPS — requirements, standards, approvals, implementation and validation not proven

## Quality Checks
- Separate authentication from authorization and action-specific grants.
- Fail closed on missing tenant/identity policy and unresolved high-risk flows.
- Cite exact revisions/file paths for observations.
- Never report planning as implementation or tested deployment.

## Source Provenance
MAWS-authored candidate informed by wshobson/agents auth-implementation-patterns at immutable commit 0874a27b17a22e2b7c2e2bcd725768e0803cad06 (MIT; Copyright (c) 2024 Seth Hobson). Upstream example code and references/details.md are not bundled or admitted. No runtime authority.
