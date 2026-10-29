---
name: api-contract-review
description: Review REST, GraphQL, and OpenAPI service contracts for consumer boundaries, compatibility breaks, and missing negative coverage from explicit specs and repo evidence.
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

# API Contract Review

## Trigger

Use this skill when a REST, GraphQL, or OpenAPI service contract change needs a consumer-boundary and compatibility review before merge or release.

## When Not To Use

- Do not use for MCP server design; use the native `mcp-server-creation` skill.
- Do not use to derive backend contracts from UI markup; use the native `ui-to-backend-contract-extractor` skill.
- Do not use for whole-system architecture review; use the native `architecture-depth-review` skill.
- Do not use to claim runtime contract conformance without executing the proposed contract tests.

## Purpose

Bound consumer-facing contract review for REST, GraphQL, and OpenAPI surfaces: who calls what, which changes break whom, and which failure cases the contract tests do not yet cover.

## Boundary Differentiation

- `mcp-server-creation` covers MCP server design; this skill reviews HTTP/GraphQL service contracts.
- `ui-to-backend-contract-extractor` derives contract drafts from UI markup; this skill reviews an existing specification.
- `architecture-depth-review` covers system-level structure; this skill stays inside the API boundary.

## Workflow

1. Map callers, consumers, tenants, and side effects for each operation from the supplied specification and repo evidence.
2. Record auth requirements, request and response schemas, error shapes, pagination, and idempotency for every operation.
3. Compare old and new contract revisions for breaking changes, including retry and partial-failure behavior.
4. Propose negative tests and contract tests bound to the reviewed revision, and list what they do not cover.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`
- `git-diff-explainer`
- `validate-repo-surface`

## Local Inputs

- repository root
- API specification files (OpenAPI, GraphQL schema, or equivalent)
- caller and tenant boundary description
- old and new contract revisions to compare

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

- `BOUNDARY`
- `OPERATIONS`
- `COMPATIBILITY`
- `NEGATIVE TESTS`
- `GAPS`

## Quality Checks

- cite exact file paths and specification revisions for every claim
- reject undocumented writes in read operations instead of normalizing them away
- flag missing tenant or auth failure cases as gaps, never as passes
- never present an unexecuted OpenAPI or schema validation as a pass
- keep specified behavior, implemented evidence, and inferred intent distinct
