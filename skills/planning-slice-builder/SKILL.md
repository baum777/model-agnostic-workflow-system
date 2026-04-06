---
name: planning-slice-builder
description: Break a broad task into bounded implementation waves with scope, dependencies, non-goals, and acceptance criteria.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: codex-workflow-core
status: extracted
---

# Planning Slice Builder

## Trigger

Use this skill when a request is broad enough that one safe implementation pass needs bounded waves, dependencies, and gates.

## When Not To Use

- Do not use for trivial edits.
- Do not use when an implementation plan is already locked.
- Do not use to widen scope.

## Non-Goals
- This skill does not choose test coverage in detail.
- This skill does not perform failure analysis or patch strategy selection.
- This skill does not write the final implementation or review.

## Workflow

1. Restate the goal in operational terms.
2. Split the work into bounded waves.
3. Attach dependencies, non-goals, and acceptance criteria to each wave.
4. Mark the smallest safe first slice.
5. Identify the verification points that gate progress.

## Output

Use these headings:

- `SUMMARY`
- `IMPLEMENTATION WAVES`
- `DEPENDENCIES`
- `NON-GOALS`
- `RISKS`
- `ACCEPTANCE CRITERIA`
- `NEXT ACTIONS`

## Quality Checks

- Each wave must be independently understandable.
- Dependencies must be explicit and ordered.
- Non-goals must exclude obvious scope creep.
- Acceptance criteria must be testable or reviewable.

## References

- `docs/overview.md`
- `docs/adoption-playbook.md`
- `templates/codex-workflow/task-packet-template.md`
- `examples/codex-workflow/planning-slice-example.md`
