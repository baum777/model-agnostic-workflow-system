---
name: post-implementation-review-writer
description: Produce operator-grade review summaries from changes, diffs, tests, risks, and follow-up work.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: codex-workflow-core
status: extracted
---

# Post-Implementation Review Writer

## Trigger

Use this skill after a change is implemented and verified, or when a handoff needs an operator summary grounded in actual evidence.

## When Not To Use

- Do not use before the change exists.
- Do not use to replace a real test or gate result.
- Do not use to inflate confidence without evidence.

## Non-Goals
- This skill does not pre-decide the change or implementation plan.
- This skill does not create release narrative or stakeholder marketing copy.
- This skill does not replace validation or verification work.

## Workflow

1. Read the diff, tests, and any gate output.
2. Summarize what changed and why.
3. Identify residual risks and follow-up work.
4. Record rollback notes and verification evidence.
5. Keep the review concise and action-oriented.

## Local Inputs

- diff summary or patch
- gate output
- test evidence
- rollback notes

## Output

Use these headings:

- `SUMMARY`
- `FINDINGS`
- `RISKS`
- `TESTS`
- `ROLLBACK`
- `FOLLOW-UP`

## Quality Checks

- Stay grounded in actual changes and evidence.
- Call out missing verification directly.
- Mention rollback paths explicitly.
- Keep the summary suitable for a PR or handoff note.

## References

- `templates/codex-workflow/review-summary-template.md`
- `docs/validation-checklist.md`
