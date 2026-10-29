---
name: state-consistency-review
description: Review client state ownership, mutation flows, staleness handling, and optimistic-update recovery from repo evidence without inventing runtime observations.
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

# State Consistency Review

## Trigger

Use this skill when an application's client state model — ownership, mutations, caches, optimistic updates — needs a focused consistency review before merge or release.

## When Not To Use

- Do not use to derive backend contracts from UI markup; use the native `ui-to-backend-contract-extractor` skill.
- Do not use for API shape and compatibility review; use the native `api-contract-review` skill.
- Do not use for whole-system structure review; use the native `architecture-depth-review` skill.
- Do not use to claim runtime behavior that was not observed or executed.

## Purpose

Bounded review of client state consistency: who owns each piece of state, how mutations flow and invalidate, and how optimistic updates recover when the server disagrees.

## Boundary Differentiation

- `ui-to-backend-contract-extractor` drafts contracts from the UI; this skill reviews state ownership and recovery once the contract exists.
- `api-contract-review` covers the service boundary; this skill covers the client side of consistency.
- `frontend-performance-review` covers loading and render cost; this skill covers correctness of state transitions.

## Workflow

1. Partition state by ownership from repo evidence: server-authoritative data, client-owned state, and cached projections of server data.
2. Trace mutation flows: who writes, what invalidates or refetches, and what can drift between cache and source of truth.
3. Check every optimistic update for a recovery path: rollback or reconciliation on failure, conflict, or stale response.
4. Trace failure branches: offline, race, and out-of-order responses; identify where the UI can show state the server never accepted.
5. Specify negative tests for conflicts, races, and revocation-style staleness bound to the reviewed revision.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`
- `git-diff-explainer`
- `validate-repo-surface`

## Local Inputs

- repository root
- state management code and store definitions
- mutation/query flow documentation or code
- failure-mode expectations, if documented

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

- `OWNERSHIP MAP`
- `MUTATION FLOWS`
- `RECOVERY PATHS`
- `NEGATIVE TESTS`
- `GAPS`

## Quality Checks

- never invent runtime observations; unresolved behavior goes to `GAPS`
- an optimistic update without a rollback or reconciliation path is a finding, not a style choice
- every ownership and flow claim cites exact file paths
- cached projections stay visibly distinct from sources of truth
- default to the server as the authority when ownership is ambiguous, and record the ambiguity
