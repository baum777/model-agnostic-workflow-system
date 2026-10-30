---
name: api-design-principles
description: Plan future REST or GraphQL API resources, operations, security, error handling and compatibility from bounded product requirements without publishing endpoints.
version: 0.1.0
classification: shared-with-local-inputs
requires_repo_inputs: true
produces_structured_output: true
safe_to_auto_run: false
owner: model-agnostic-workflow-system
status: candidate
---

# API Design Principles — MAWS Candidate

## Purpose
Produce a prospective consumer-facing API design and validation plan; do not confuse a written specification with an implemented endpoint.

## Trigger
Use for prospective REST, GraphQL or webhook interface design when new requirements, caller scopes and service constraints can be identified.

## When Not To Use
- Existing specification review, drift or compatibility audit: use api-contract-review.
- UI-derived API extraction: use ui-to-backend-contract-extractor.
- MCP-specific interfaces: use mcp-server-creation.
- Do not deploy endpoints, invoke private/live APIs, publish OpenAPI, run migrations or alter grants.

## Boundary Differentiation
This skill authors a design proposal. Api-contract-review reviews established contracts. No prospective compatibility claim counts as an audit verdict.

## Required Inputs
- Repo and revision, product use cases, resource lifecycle and service constraints
- Consumer identities, tenant/resource/action matrix, data sensitivity and side effects
- Existing contract/version baseline when relevant; failure and compatibility requirements

## Workflow
1. Record observed requirements, assumptions and unresolved owner decisions separately.
2. Model resources, identities, representations, relationships, lifecycle and REST/GraphQL operation choices. Keep persistence details out of public contracts.
3. For each operation define authority checks, input validation, output DTO, authentication failures, pagination limits/cursors, error shape, rate limits, logging and data exposure.
4. Keep safe/read operations side-effect free. Specify idempotency keys and deduplication for writes where needed, timeouts, partial failure and reconciliation; prohibit blind retries on unknown outcomes.
5. Document consumer compatibility, schema/version negotiation, migration, deprecation and rollback; do not claim compatibility without known baselines.
6. Plan adversarial and negative tests for cross-tenant reads/writes, mass assignment, malformed payloads, authorization bypass, unbounded pagination, excessive GraphQL depth/N+1 and sensitive error disclosures.
7. Deliver implementation tasks and verification requirements, not deployment claims.

## Tool Requirements
- repo-structure-scanner
- spec-compliance-checker
- git-diff-explainer
- validate-repo-surface
Read-only planning only; tool listing is not permission to invoke remote APIs.

## Local Inputs
Repository root/revision, product requirements, bounded model, caller/tenant matrix, non-sensitive examples and old contracts if any.

## Approval Mode
read-only; explicit user invocation. Writes and publication require separate MAWS authority.

## Provider Projections
- OpenAI/Codex: native after admission
- Claude: adapter after admission
- Qwen Code: adapter after admission
- Kimi K2.5: adapter after admission

## Eval Scaffolding
- Positive: design a new endpoint family.
- Negative routing: review existing OpenAPI delta selects api-contract-review.
- Security negatives: unknown tenant auth, side-effecting GET, blind retries, unsupported compatibility assertion.
- Require output checks and provider parity after admission.

## Output
- RESOURCES — identities, owners and lifecycle
- OPERATIONS — methods/queries, permissions, schemas, side effects
- CONTRACTS — errors, pagination, idempotency, limits, observability
- COMPATIBILITY — consumers, versions, migrations, rollback
- NEGATIVE TESTS — cases and expected results only
- GAPS — missing input, unverified compatibility, approvals and test evidence

## Quality Checks
- Default-deny when tenant/resource access is unspecified.
- Explicitly distinguish safe methods, idempotency and safe retries.
- Map failure, conflict and unknown-outcome branches for mutations.
- Do not equate a designed contract with a tested or running API.
- Require exact baseline and identified consumers for compatibility verdicts.

## Source Provenance
MAWS-authored candidate informed by wshobson/agents api-design-principles at immutable commit 0874a27b17a22e2b7c2e2bcd725768e0803cad06 (MIT; Copyright (c) 2024 Seth Hobson). Upstream reference files and code examples are not bundled or admitted. No runtime authority.
