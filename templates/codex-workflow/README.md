# Codex Workflow Templates

Class: operational.
Use rule: use templates as operator-facing scaffolds; canonical contract truth remains in `core/contracts/`.

## Objective

Map workflow classes to reusable task/review/handoff templates without creating a second authority surface.

## Canonical Contract Links

- `core/contracts/output-contracts.json`
- `core/contracts/workflow-routing-map.json`

## Template Map

- `task-packet-template.md`
  - primary contract: `workflow-plan-v1`
  - workflow classes: `implementation-planning`
- `review-summary-template.md`
  - primary contracts: `workflow-validation-summary-v1`, `workflow-certification-summary-v1`
  - workflow classes: `verification-and-review`, `migration-and-compatibility`, `readiness-and-release-review`
- `handoff-summary-template.md`
  - primary contracts: `workflow-run-summary-v1`, `workflow-handoff-summary-v1`
  - workflow classes: `implementation`, `migration-and-compatibility`, `readiness-and-release-review`

## Safe Extension Steps

1. Update workflow/output mappings in `core/contracts/workflow-routing-map.json` and `core/contracts/output-contracts.json` first when template linkage changes.
2. Keep template changes structural and artifact-oriented; do not restate canonical contract truth in conflicting prose.
3. If a new template is required, keep it bounded to `templates/codex-workflow/` and link it from this index.
4. Run `npm run validate`, `npm run validate-neutral`, and `npm run eval` before treating template linkage as complete.

## Maturity Posture

- `prose-governed`: template usage guidance in this file.
- `contract-backed`: required section structure in `core/contracts/output-contracts.json`.
- `validator-backed`: consistency checks in `scripts/tools/validate-provider-neutral-core.mjs` and certification fixtures.
- `runtime-implemented`: not claimed for workflow orchestration; templates are artifact scaffolds only.
