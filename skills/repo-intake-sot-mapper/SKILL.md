---
name: repo-intake-sot-mapper
description: Map a repository to its canonical docs, entrypoints, risk surfaces, and test surfaces using explicit local inputs.
version: 1.0.0
classification: shared-with-local-inputs
requires_repo_inputs: true
produces_structured_output: true
safe_to_auto_run: true
owner: codex-workflow-core
status: extracted
input_contract_path: .codex/repo-intake-inputs.json
---

# Repo Intake & SoT Mapper

## Trigger

Use this skill when the consumer repo has supplied the declared local input contract and you need to map repository truth from declared canonical sources before changing it.

## When Not To Use

- Do not use for narrow single-file fixes.
- Do not use when the consumer repo has not supplied `.codex/repo-intake-inputs.json`.
- Do not use when the repo-specific canonical sources are already fully mapped for the task.
- Do not use as a substitute for implementation planning.

## Non-Goals
- This skill does not infer hidden truth outside the declared local contract.
- This skill does not replace generic planning or implementation design.
- This skill does not convert into a generic repo scanner.
- This skill does not proceed when required local inputs are absent.

## Workflow

1. Read the consumer repo's local input contract first.
2. Read the declared canonical source files and governance files.
3. Locate entrypoints, packages, scripts, and test surfaces using the declared inputs.
4. Note drift, ambiguities, missing guardrails, and undocumented behavior.
5. Produce a short report with explicit evidence from the declared inputs.
6. Validate the local contract with `npm run validate-input-contract -- --contract .codex/repo-intake-inputs.json` when you need machine-readable confirmation.

## Local Inputs

- Required local input file: `.codex/repo-intake-inputs.json`
- Use only the repo-local paths declared in that file for canonical sources, docs, governance files, entrypoints, and test commands.
- Do not infer hidden canonical sources outside the declared input contract.

## Output

Use these headings:

- `SUMMARY`
- `CANONICAL SOURCES`
- `ENTRYPOINTS`
- `RISKS`
- `TEST SURFACES`
- `GAPS`
- `NEXT ACTIONS`

## Quality Checks

- Cite file paths, not vague descriptions.
- Separate source-of-truth docs from supporting docs.
- Call out uncertainty instead of inferring hidden structure.
- Prefer a readable inventory over a long narrative.
- Confirm the local input contract is valid before trusting the repo map.

## References

- `docs/shared-with-local-inputs.md`
- `docs/repo-intake-skill-contract.md`
- `docs/overview.md`
- `docs/architecture.md`
- `scripts/tools/validate-local-input-contract.mjs`
- `templates/codex-workflow/review-summary-template.md`
- `examples/codex-workflow/review-summary-example.md`
