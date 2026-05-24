---
name: architecture-depth-review
description: Review an implementation or design for architectural depth: module boundaries, coupling, deletion resistance, test seams, and AI-navigable locality before broadening or promoting a slice.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: model-agnostic-workflow-system
status: extracted
output_contract_path: core/contracts/output-contracts.json
tool_contract_catalog_path: core/contracts/tool-contracts/catalog.json
provider_projection_path: core/contracts/portable-skill-manifest.json
eval_profile_path: evals/catalog.json
---

# Architecture Depth Review

## Purpose

Assess whether a proposed or implemented slice has durable architectural boundaries rather than shallow organization, incidental coupling, or hard-to-review spread.

## Trigger

Use this skill when a design, implementation plan, or completed diff touches multiple modules, introduces a reusable abstraction, changes ownership boundaries, or feels difficult to understand from local evidence.

## When Not To Use

- Do not use for small single-file edits with obvious ownership.
- Do not use as a substitute for security review, readiness gates, or runtime validation.
- Do not use to demand broad refactors unrelated to the requested slice.
- Do not use when no concrete design, diff, module map, or implementation evidence is available.

## Required Inputs

- target design, diff, module map, or implementation summary
- relevant source paths and ownership boundaries
- constraints, non-goals, and compatibility requirements
- current validation or test evidence if available

## Workflow

1. Identify the architectural unit under review and the exact paths or surfaces it spans.
2. Map module boundaries, dependencies, and ownership direction from observed evidence.
3. Apply the deletion test: identify what could be removed or replaced without unrelated consumers breaking.
4. Check coupling depth: distinguish intentional shared contracts from incidental imports, broad helpers, hidden global state, or duplicated policy logic.
5. Check test seams and review locality: identify whether behavior can be verified near the changed boundary.
6. Check AI-navigability: identify whether a future agent can locate authority, entrypoints, contracts, and failure signals without broad repo scanning.
7. Recommend the smallest architectural adjustment only when it reduces real coupling, ambiguity, or verification risk.
8. Mark unresolved authority, ownership, or evidence gaps as blockers rather than proposing speculative restructuring.

## Boundary Differentiation

- Use `repo-audit` when the main need is broad repository state and migration readiness.
- Use `source-conflict-resolver` when the main issue is contradictory source authority.
- Use `spec-to-task-breakdown` when a bounded spec needs execution slices rather than architecture critique.
- Use `readiness-check` when a completed slice needs a gate verdict.

## Tool Requirements

- `repo-structure-scanner`
- `git-diff-explainer`
- `spec-compliance-checker`

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
- approval boundary
- provider parity
- failure modes

## Output

- `SUMMARY`
- `REVIEW TARGET`
- `BOUNDARY MAP`
- `DEPENDENCY / COUPLING FINDINGS`
- `DELETION TEST`
- `TEST SEAMS`
- `AI-NAVIGABILITY`
- `RECOMMENDED ADJUSTMENTS`
- `BLOCKERS`
- `NEXT ACTIONS`

## Quality Checks

- Findings must cite concrete paths, contracts, or dependency edges.
- Do not recommend abstractions unless they reduce real coupling or repeated policy logic.
- Separate required fixes from advisory architectural improvements.
- Keep recommendations bounded to the reviewed slice.
- Treat missing authority or ownership evidence as a blocker.

## Nearest Sibling Skills

- `core/skills/repo-audit/SKILL.md`
- `core/skills/source-conflict-resolver/SKILL.md`
- `core/skills/spec-to-task-breakdown/SKILL.md`
- `core/skills/readiness-check/SKILL.md`
