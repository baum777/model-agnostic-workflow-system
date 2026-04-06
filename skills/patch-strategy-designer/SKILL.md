---
name: patch-strategy-designer
description: Decide whether a change should be a minimal patch, local refactor, isolation boundary, or larger rewrite.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: codex-workflow-core
status: extracted
---

# Patch Strategy Designer

## Trigger

Use this skill when a change request could be solved by several levels of intervention and the smallest safe intervention size must be chosen.

## When Not To Use

- Do not use when the patch size is already mandated.
- Do not use to justify a rewrite without evidence.
- Do not use to skip the simplest viable fix.

## Non-Goals
- This skill does not plan the whole task.
- This skill does not write tests or review evidence.
- This skill does not choose feature scope.

## Workflow

1. Identify the behavior delta.
2. Compare minimal patch, local refactor, boundary isolation, and rewrite.
3. Choose the smallest change that preserves correctness.
4. State why deeper intervention is not warranted yet.
5. Call out the verification burden for the chosen option.

## Output

Use these headings:

- `SUMMARY`
- `STRATEGY`
- `WHY THIS SIZE`
- `RISKS`
- `NEXT ACTIONS`

## Quality Checks

- The recommendation must be justified, not preference-based.
- The smallest safe option should be explicit.
- Rewrites require a clear correctness or maintainability reason.

## References

- `docs/overview.md`
- `docs/repo-overlay-contract.md`
