---
name: implementation-contract-extractor
description: Extract concrete implementation contracts from docs or specs, including interfaces, schemas, invariants, edge cases, and tests.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: codex-workflow-core
status: extracted
---

# Implementation Contract Extractor

## Trigger

Use this skill when a source artifact or linked canonical docs need to become implementation requirements.

## When Not To Use

- Do not use on raw brainstorming without an anchor artifact.
- Do not use when the implementation contract already exists.
- Do not use to widen scope beyond the source artifact.

## Non-Goals
- This skill does not do planning-slice decomposition.
- This skill does not do test planning.
- This skill does not do post-implementation review writing.
- This skill does not execute or prescribe the full implementation itself.

## Workflow

1. Read the source artifact and linked canonical docs.
2. Extract interfaces, schema shapes, invariants, and failure boundaries.
3. Separate hard requirements from preferences.
4. Note edge cases, validation rules, and test expectations.
5. Emit a contract that can drive implementation directly.

## Local Inputs

- source spec or doc
- consumer repo canonical sources
- overlay contract entries that affect scope

## Output

Use these headings:

- `SUMMARY`
- `CONTRACTS`
- `INVARIANTS`
- `EDGE CASES`
- `TESTS`
- `OPEN QUESTIONS`

## Quality Checks

- Every contract item must be backed by source text or explicit inference.
- Mark inference as inference.
- Keep types, names, and invariants deterministic.
- Include tests for each risky contract boundary.

## References

- `docs/repo-overlay-contract.md`
- `docs/compatibility.md`
