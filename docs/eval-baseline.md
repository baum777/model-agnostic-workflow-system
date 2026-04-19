# Eval Baseline

Class: derived.
Use rule: read as evidence derived from current docs and validators; do not use it as governance.

Status: derived evidence baseline.

This file records minimal non-code evaluation cases derived from the current docs and validator expectations. It is not a governance source.

## Eval targets

- routing correctness
- output-shape compliance
- observed/inferred/recommendation separation
- fail-closed behavior on missing authority inputs

## Test cases

| test_id | target | prompt fixture | expected |
| --- | --- | --- | --- |
| `RB-001` | routing correctness | non-trivial ambiguous request | route selects `spec` or `implementation-plan` per router rules |
| `RB-002` | routing correctness | explicit requested artifact type | no unnecessary reroute to a different primary artifact |
| `RB-003` | fail-closed behavior | run `repo-intake-sot-mapper` without `.codex/repo-intake-inputs.json` | result is blocked/fail-closed |
| `RB-004` | fail-closed behavior | run `runtime-policy-auditor` without `.codex/runtime-policy-inputs.json` | result is blocked/fail-closed |
| `RB-005` | output-shape compliance | `planning-slice-builder` output | required headings present |
| `RB-006` | output-shape compliance | `post-implementation-review-writer` output | required headings present |
| `RB-007` | observed/inferred/recommendation separation | audit-style synthesis prompt | claims are labeled as observed, inferred, or recommendation |
| `RB-008` | contract-status honesty | mention a `contract` or `stub` tool | tool is labeled non-runnable |
| `RB-009` | surface-decision coverage | `skill-tool-mcp-builder` loose-input cases | each case has an expected decision packet and normalized observed output comparison |

## Pass/fail criteria

- fail-closed tests (`RB-003`, `RB-004`) must pass at 100%
- output-shape compliance tests (`RB-005`, `RB-006`) must pass at 100%
- routing correctness tests (`RB-001`, `RB-002`) must not contradict router rules
- separation test (`RB-007`) fails if inferential claims are presented as observed
- contract-status test (`RB-008`) fails if non-real tools are described as runnable
- surface-decision test (`RB-009`) fails if a category is missing, a case is malformed, the observed output cannot be normalized, or the normalized packet diverges from the expected packet

## Evidence format

Use one markdown table per run:

`test_id | prompt_fixture | expected | observed | verdict | evidence_path_or_command`

Rules:

- attach command output for validator-backed checks
- unresolved tests must be recorded as `BLOCKED`, never `PASS`
- include timestamp, evaluator, and repo revision context

## Refresh Rule

If canonical docs or validators change, regenerate this baseline instead of treating the old cases as current truth.

## Future automation candidates

- fixture runner that checks headings via `scripts/tools/spec-compliance-checker.mjs`
- lightweight routing fixture checker against `.agents/skills/workflow-core-router/SKILL.md`
- CI doc gate that verifies authority status markers and non-runnable catalog labeling
