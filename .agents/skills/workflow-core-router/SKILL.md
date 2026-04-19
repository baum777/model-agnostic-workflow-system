---
name: workflow-core-router
description: Repo-local control-plane skill that selects the primary workflow artifact shape (spec, handover, architecture map, checklist, runbook, or implementation plan) with explicit gates.
version: 1.0.0
classification: local-only
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: model-agnostic-workflow-system
status: active
---

# Workflow Core Router

## Trigger
Use this skill when task scope, artifact shape, or execution path is non-trivial and the repo-local primary artifact shape must be chosen first.
Use `skill-tool-mcp-builder` first when the request is about what kind of surface should be created or changed.

## When Not To Use
- Do not use for small obvious edits with a single direct implementation path.
- Do not use when a required artifact type is already explicitly requested and scoped.

## Non-Goals
- This skill does not author the final artifact.
- This skill does not choose implementation details inside the selected shape.
- This skill does not act as a general planner or cross-repo router.
- This skill does not decide whether a new skill, tool, MCP surface, extension, or docs-only change is justified.

## Expected Inputs
- objective and requested outcome
- risk level and governance sensitivity
- known constraints and non-goals
- current evidence available vs missing
- whether the task is one-off or repeatable

## Routing Logic
1. If the request is about choosing a repo action or surface type, route to `skill-tool-mcp-builder`.
2. If requirements are ambiguous or authority boundaries are unclear, route to `spec`.
3. If work spans multiple modules or ownership boundaries, route to `architecture-map`.
4. If work is operationally repeatable, role-based, or incident-facing, route to `runbook`.
5. If the goal is execution-ready delivery with gates, route to `implementation-plan`.
6. If the main need is validation coverage or release readiness checks, route to `checklist`.
7. If the primary need is transfer of in-flight state, route to `handover`.
8. Allow one primary shape and at most one secondary shape when strictly needed.

## Minimal Output Shapes
- `spec`: `OBJECTIVE`, `CURRENT TRUTH`, `GAPS`, `CONSTRAINTS`, `DECISIONS NEEDED`, `ACCEPTANCE CRITERIA`
- `architecture-map`: `SYSTEM BOUNDARY`, `COMPONENTS`, `INTERFACES`, `AUTHORITY`, `RISKS`, `MIGRATION ORDER`
- `runbook`: `TRIGGER`, `PREREQS`, `STEPS`, `GATES`, `FAILURE HANDLING`, `EVIDENCE`
- `implementation-plan`: `SCOPE`, `SLICES`, `DEPENDENCIES`, `TESTS`, `ROLLBACK`, `DONE CRITERIA`
- `checklist`: `CHECK`, `OWNER`, `EVIDENCE`, `PASS/FAIL RULE`
- `handover`: `CURRENT STATE`, `CHANGES MADE`, `OPEN GAPS`, `NEXT ACTION`, `BLOCKERS`

## Done Criteria
- A single primary artifact shape is selected and justified.
- Route is based on observed evidence, not assumptions.
- Acceptance gates and completion conditions are explicit.
- Any unresolved ambiguity is called out as a blocker, not hidden.

## Quality Checks
- Separate observed facts from inference and recommendation.
- Keep the route decision compact and deterministic.
- Prefer the lowest-ambiguity shape that enables safe execution.
