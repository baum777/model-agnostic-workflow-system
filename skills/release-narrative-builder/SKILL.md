---
name: release-narrative-builder
description: Produce clean release notes, handover notes, and stakeholder-readable summaries grounded in actual repo changes.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: codex-workflow-core
status: extracted
---

# Release Narrative Builder

## Trigger

Use this skill when a completed change needs a stakeholder-friendly release or handover summary.

## When Not To Use

- Do not use before the change is real.
- Do not use to speculate about value without evidence.
- Do not use to replace a review or test summary.

## Non-Goals
- This skill does not perform evidence review or verification.
- This skill does not replace the post-implementation review writer.
- This skill does not describe unmerged or hypothetical changes as landed.

## Workflow

1. Read the actual change summary and supporting evidence.
2. Translate the work into a short narrative for operators or stakeholders.
3. Highlight user-facing or workflow-facing changes first.
4. Note operational follow-up if any.
5. Keep the output concise and grounded.

## Local Inputs

- change summary
- evidence of verification
- target audience or distribution context
- any rollback note that should be visible

## Output

Use these headings:

- `SUMMARY`
- `RELEASE NOTES`
- `HIGHLIGHTS`
- `OPERATIONAL NOTES`
- `FOLLOW-UP`

## Quality Checks

- Keep the language plain and user-facing.
- Mention only changes that actually landed.
- Include operational notes when rollout or support needs attention.

## References

- `templates/codex-workflow/review-summary-template.md`
- `docs/adoption-playbook.md`
