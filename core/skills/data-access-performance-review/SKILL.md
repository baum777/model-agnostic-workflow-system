---
name: data-access-performance-review
description: Review query access paths, indexes, locking, and workload evidence for data-access changes from supplied schema and query snapshots without executing production SQL.
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

# Data Access Performance Review

## Trigger

Use this skill when a data-access layer, query set, index plan, or workload profile needs a bounded performance and safety review from captured snapshots.

## When Not To Use

- Do not use for schema migration sequencing and rollout planning; use the native `migration-planner` skill.
- Do not use for whole-system architecture review; use the native `architecture-depth-review` skill.
- Do not use to execute, benchmark, or tune queries against a live or production database.

## Purpose

Bounded performance and safety review of data-access changes from captured snapshots: access paths, indexes, locking, and workload evidence, without touching production data.

## Boundary Differentiation

- `migration-planner` sequences schema migrations and rollout; this skill reviews query and workload posture.
- `architecture-depth-review` covers system structure; this skill stays inside the data-access layer.

## Workflow

1. Identify access paths, constraints, and query bounds from the supplied schema and query snapshots.
2. Use supplied execution plans and workload evidence only; never invent benchmark or EXPLAIN data.
3. Review indexes, locks, isolation levels, and query bounds; separate read-only queries from side-effecting functions in every finding.
4. Propose safe measurement steps and rollback boundaries that do not touch production data.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`
- `git-diff-explainer`
- `validate-repo-surface`

## Local Inputs

- repository root
- schema and query snapshots
- workload evidence (captured plans, traces, or metrics)
- data sensitivity classification

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

- `ACCESS PATHS`
- `EVIDENCE`
- `RISKS`
- `MEASUREMENT PLAN`
- `ROLLBACK`

## Quality Checks

- no production SQL execution; analyze supplied artifacts only
- never fabricate EXPLAIN, benchmark, or timing evidence; missing evidence is a risk item
- keep read-only queries and side-effecting functions visibly separate
- cite exact file paths and snapshot revisions for every access-path claim
