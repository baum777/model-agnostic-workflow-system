---
name: behavior-first-tdd
description: Drive implementation with a behavior-first red-green-refactor loop that starts from observable behavior, proves the failing test, applies the smallest fix, and preserves regression evidence.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: model-agnostic-workflow-system
status: extracted
output_contract_path: core/contracts/output-contracts.json
tool_contract_catalog_path: core/contracts/tool-contracts/catalog.json
provider_projection_path: core/contracts/portable-skill-manifest.json
eval_profile_path: evals/catalog.json
---

# Behavior First TDD

## Purpose

Keep implementation work anchored to observable behavior by requiring a failing test, the smallest passing change, and explicit regression evidence before broadening the slice.

## Trigger

Use this skill when implementing a feature, bugfix, or contract change where expected behavior can be stated and verified before or during code changes.

## When Not To Use

- Do not use when no executable or reviewable behavior can be defined.
- Do not use for broad test coverage planning; use `test-matrix-builder`.
- Do not use for root-cause discovery before the failure is understood; use `diagnostic-feedback-loop`.
- Do not use to weaken or rewrite tests only to force a pass.
- Do not use when the task is docs-only and has no executable or artifact behavior.

## Required Inputs

- expected behavior stated as user-visible, API-visible, contract-visible, or artifact-visible outcome
- target code or contract surface to change
- available test command, fixture, or validator command
- constraints, non-goals, and compatibility expectations

## Workflow

1. State the behavior in observable terms and identify the smallest surface where it should be verified.
2. Choose one focused test, fixture, or validator assertion that would fail before the implementation.
3. Run or describe the failing check and record the expected failure signal.
4. Implement only the smallest change needed to make that check pass.
5. Run the focused check again and record the passing signal.
6. Refactor only inside the touched boundary when it improves clarity without changing behavior.
7. Run the relevant surrounding regression gate and record the evidence.
8. If a failing check cannot be created or executed, return `BLOCKED` with the missing behavior, fixture, or command.

## Boundary Differentiation

- Use `test-matrix-builder` for multi-layer coverage planning across unit, integration, E2E, rollback, and failure-path tests.
- Use `diagnostic-feedback-loop` when the root cause or minimized failure is not yet known.
- Use `patch-strategy-designer` when the main decision is how large the intervention should be.
- Use `readiness-check` when the implementation is complete and needs a gate verdict.

## Tool Requirements

- `test-matrix-builder`
- `patch-strategy-designer`
- `diagnostic-feedback-loop`

## Approval Mode

- read-only

## Provider Projections

- OpenAI/Codex: native
- Claude: adapter
- Qwen Code: adapter
- Kimi K2.5: adapter

## Eval Scaffolding

- routing
- schema conformance
- tool selection
- approval boundary
- provider parity
- failure modes

## Output

- `SUMMARY`
- `BEHAVIOR UNDER TEST`
- `FAILING CHECK`
- `IMPLEMENTATION BOUNDARY`
- `PASSING CHECK`
- `REFACTOR NOTES`
- `REGRESSION GATE`
- `BLOCKERS`
- `NEXT ACTIONS`

## Quality Checks

- The failing check must map directly to the behavior under test.
- Do not recommend implementation before the failure signal is explicit.
- Keep the implementation boundary smaller than the regression gate.
- Refactor notes must preserve behavior and stay inside the touched boundary.
- Missing fixtures, commands, or executable behavior must be blockers, not assumptions.

## Nearest Sibling Skills

- `skills/test-matrix-builder/SKILL.md`
- `core/skills/diagnostic-feedback-loop/SKILL.md`
- `skills/patch-strategy-designer/SKILL.md`
- `core/skills/readiness-check/SKILL.md`
