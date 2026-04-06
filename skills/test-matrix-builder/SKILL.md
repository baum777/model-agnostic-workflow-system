---
name: test-matrix-builder
description: Produce a concrete test plan across unit, integration, E2E, regression, failure-path, and rollback dimensions.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: codex-workflow-core
status: extracted
---

# Test Matrix Builder

## Trigger

Use this skill when a change needs explicit verification coverage before implementation or merge, and the verification plan must be spelled out.

## When Not To Use

- Do not use for pure documentation edits with no runtime impact.
- Do not use when the test scope is already fixed and fully enumerated.
- Do not use to create tests unrelated to the request.

## Non-Goals
- This skill does not perform failure analysis or pick a patch strategy.
- This skill does not implement tests or code changes.
- This skill does not replace planning-slice or review workflows.

## Workflow

1. Identify the behavior under test.
2. Map test layers: unit, integration, E2E, regression, failure-path, rollback.
3. Tie each layer to a specific risk.
4. Define pass/fail criteria and fixtures.
5. Mark required vs optional tests.

## Local Inputs

- repo-specific test commands
- fixtures or seed data
- deployment or rollback constraints

## Output

Use these headings:

- `SUMMARY`
- `TEST MATRIX`
- `FIXTURES`
- `FAILURE PATHS`
- `ROLLBACK CHECKS`
- `OPEN GAPS`

## Quality Checks

- Every risk should map to at least one test.
- Failure-path tests must be explicit.
- Prefer deterministic fixtures over ad hoc data.
- Include rollback verification where state can persist.

## References

- `docs/validation-checklist.md`
- `templates/codex-workflow/validation-checklist-template.md`
