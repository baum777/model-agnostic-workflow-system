# Codex Workflow Examples

Class: derived.
Use rule: examples are onboarding and audit scaffolds only; canonical authority remains in `WORKFLOW.md` and `core/contracts/*`.

## Objective

Provide bounded examples that project canonical workflow/output/template contracts into reusable operator artifacts.

## Example Map

- `planning-slice-example.md`
  - workflow class: `implementation-planning`
  - output contracts: `workflow-plan-v1`, `workflow-validation-summary-v1`
  - template: `templates/codex-workflow/task-packet-template.md`
- `review-summary-example.md`
  - workflow class: `verification-and-review`
  - output contracts: `workflow-validation-summary-v1`, `workflow-certification-summary-v1`
  - template: `templates/codex-workflow/review-summary-template.md`
- `handoff-summary-example.md`
  - workflow class: `implementation`
  - output contracts: `workflow-run-summary-v1`, `workflow-handoff-summary-v1`, `workflow-validation-summary-v1`
  - template: `templates/codex-workflow/handoff-summary-template.md`

## Portability Posture

- Examples are provider-agnostic and contract-aligned.
- Examples must not introduce authority that conflicts with canonical contracts.
- Compatibility/provider exports consume canonical contracts, not example content.

## Safe Extension Steps

1. Keep workflow/output/template truth canonical in `core/contracts/*` and `templates/codex-workflow/*` first.
2. Add or update only bounded representative examples under `examples/codex-workflow/`.
3. Ensure each example links to workflow class, output contracts, and template paths already declared canonically.
4. Treat examples as derived artifacts and run `npm run validate`, `npm run validate-neutral`, and `npm run eval` after updates.

## Maturity Posture

- `prose-governed`: this example-index guidance.
- `contract-backed`: linked output contracts and workflow routing map.
- `validator-backed`: cross-surface checks for referenced examples in workflow map and validators.
- `runtime-implemented`: not claimed for examples; they are static artifacts.
