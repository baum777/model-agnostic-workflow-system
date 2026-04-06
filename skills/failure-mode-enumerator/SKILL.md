---
name: failure-mode-enumerator
description: Systematically enumerate breakpoints, abuse paths, edge conditions, race conditions, and recovery expectations.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: codex-workflow-core
status: extracted
---

# Failure Mode Enumerator

## Trigger

Use this skill when a design, change, or workflow needs explicit failure analysis before implementation or approval.

## When Not To Use

- Do not use for pure summarization with no risk analysis.
- Do not use to invent threats without an actual system context.
- Do not use to replace implementation or testing.

## Non-Goals
- This skill does not create the test matrix.
- This skill does not choose the patch strategy or implementation slice.
- This skill does not replace implementation or testing.

## Workflow

1. Break the system or change into failure surfaces.
2. Enumerate breakpoints, abuse paths, edge conditions, and races.
3. Describe expected recovery or fail-closed behavior.
4. Distinguish likely failures from speculative ones.
5. Surface the highest-risk gaps first.

## Output

Use these headings:

- `SUMMARY`
- `FAILURE MODES`
- `ABUSE PATHS`
- `RACE CONDITIONS`
- `RECOVERY`
- `OPEN QUESTIONS`

## Quality Checks

- Each failure mode must be concrete.
- Recovery expectations must be stated.
- Avoid duplicating low-value edge cases.
- Include abort or fallback behavior where relevant.

## References

- `docs/validation-checklist.md`
- `docs/compatibility.md`
