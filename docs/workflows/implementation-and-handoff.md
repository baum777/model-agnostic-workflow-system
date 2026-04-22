# Implementation And Handoff

Class: canonical.
Use rule: use this page for class-level implementation and handoff posture; keep root taxonomy and phase order in `WORKFLOW.md`.

## Objective

Define bounded, class-level implementation and handoff expectations without creating a second workflow authority tree.

## Covered Workflow Classes

- `implementation`
- `migration-and-compatibility` (execution/handoff subset)

## Canonical Mapping Sources

- `core/contracts/workflow-routing-map.json`
- `core/contracts/output-contracts.json`
- `templates/codex-workflow/task-packet-template.md`
- `templates/codex-workflow/handoff-summary-template.md`

## Required Output And Evidence Posture

- Planning posture for implementation slices uses `workflow-plan-v1`.
- Execution evidence posture uses `workflow-run-summary-v1`.
- Handoff posture uses `workflow-handoff-summary-v1`.
- Blocking gate evidence uses `workflow-validation-summary-v1`.
- Workflow completion remains gate- and artifact-based from `workflow-routing-map.json` completion policy.

## Validation And Gate Posture

- Required gates remain those listed per workflow class in `core/contracts/workflow-routing-map.json`.
- `validate-repo-surface` and `validate-provider-neutral-core` are blocking for `implementation`.
- `run-certification-evals` remains required for `migration-and-compatibility`.
- If required evidence artifacts are missing, result is `BLOCKED` (fail closed).

## Template Selection Guidance

- Use `task-packet-template.md` when the primary artifact is a bounded implementation plan.
- Use `handoff-summary-template.md` when execution ownership transfers or the slice ends with pending gates.
- Use `review-summary-template.md` only when the primary artifact is validation/certification posture.

## Maturity Posture

- `prose-governed`: this class-level workflow guidance.
- `contract-backed`: workflow/output linkage in `core/contracts/workflow-routing-map.json` and `core/contracts/output-contracts.json`.
- `validator-backed`: cross-surface checks in `scripts/tools/validate-provider-neutral-core.mjs` and eval fixtures.
- `runtime-implemented`: limited to concrete script executions and generated artifacts; no runtime orchestration control plane is claimed.
