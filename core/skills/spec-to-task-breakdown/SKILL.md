---
name: spec-to-task-breakdown
description: Convert a bounded specification into traceable execution slices with dependencies, blockers, and validation targets.
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

# Spec To Task Breakdown

## Purpose

Operationalize a source spec or implementation intent into traceable execution tasks without becoming a generic planner.

## Trigger

Use this skill when a bounded spec exists and needs direct conversion into execution-ready slices with explicit traceability.

## When Not To Use

- Do not use for patch-size decisioning; use `patch-strategy-designer`.
- Do not use for broad project wave planning detached from a source spec.
- Do not use for readiness gate decisions.
- Do not use for generic task list generation without source traceability.
- Do not use when the source spec is missing or too ambiguous to map safely.

## Required Inputs

- bounded source spec, writeup, or implementation intent
- constraints and non-goals attached to the source
- known dependency context and integration boundaries
- validation expectations, if declared

## Workflow

1. Normalize the source spec into implementation-relevant clauses.
2. Map clauses to task slices with explicit traceability references.
3. Identify dependencies, assumptions, and blockers per slice.
4. Attach validation targets and sequencing suggestions to each slice.
5. Mark clauses that cannot be operationalized due to ambiguity.
6. Return a bounded execution breakdown with unresolved blockers.

## Boundary Differentiation

- Patch strategy design: use `patch-strategy-designer` for intervention-size decisions.
- Broad planning: use `planning-slice-builder` or `migration-planner` for larger wave orchestration.
- Readiness checks: use `readiness-check` for gate verdicts.
- Generic task lists: this skill requires source-spec traceability for each task slice.

## Tool Requirements

- `planning-slice-builder`
- `patch-strategy-designer`
- `test-matrix-builder`

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
- `SOURCE SPEC CONTEXT`
- `SPEC-TO-TASK TRACEABILITY`
- `TASK SLICES`
- `DEPENDENCIES`
- `ASSUMPTIONS`
- `BLOCKERS`
- `VALIDATION TARGETS`
- `SUGGESTED SEQUENCING`
- `NEXT ACTIONS`

## Quality Checks

- Every task slice must map to a concrete source-spec clause.
- Dependencies must be explicit and directionally ordered.
- Assumptions and blockers must be separated clearly.
- Validation targets must be actionable and reviewable.
- Ambiguous source clauses must fail closed as unresolved blockers.

## Nearest Sibling Skills

- `skills/planning-slice-builder/SKILL.md`
- `skills/patch-strategy-designer/SKILL.md`
- `core/skills/migration-planner/SKILL.md`
- `core/skills/readiness-check/SKILL.md`
