# Verification And Certification

Class: canonical.
Use rule: use this page for class-level verification/certification posture; keep root taxonomy and phase order in `WORKFLOW.md`.

## Objective

Define explicit verification and certification expectations for review workflows, including blocking vs advisory posture and required evidence artifacts.

## Covered Workflow Classes

- `verification-and-review`
- `readiness-and-release-review`
- `migration-and-compatibility` (certification subset)

## Canonical Mapping Sources

- `core/contracts/workflow-routing-map.json`
- `core/contracts/output-contracts.json`
- `templates/codex-workflow/review-summary-template.md`
- `evals/catalog.json`
- `evals/fixtures/workflow-execution-evidence.json`
- `evals/fixtures/provider-export-alignment.json`

## Required Output And Evidence Posture

- Validation evidence uses `workflow-validation-summary-v1`.
- Certification evidence uses `workflow-certification-summary-v1`.
- Execution context may include `workflow-run-summary-v1` or `workflow-handoff-summary-v1` when class mapping expects it.
- Blocking evidence requirements come from `requiredEvidenceArtifacts` in `core/contracts/workflow-routing-map.json`.

## Validation And Gate Posture

- Required blocking gates are those listed in each workflow class `validationPosture.requiredGates`.
- `run-certification-evals` is blocking where class mapping requires certification.
- Advisory gates are recorded but do not override blocking policy.
- Missing blocking evidence or contradictory gate outcomes must return `BLOCKED`.

## Portability And Compatibility Boundary

- Canonical truth remains in `core/contracts/*`.
- Provider exports under `providers/*/export.json` are projections of canonical truth and must not introduce competing workflow/evidence authority.
- Compatibility mirrors remain intentional and validator-checked.

## Maturity Posture

- `prose-governed`: this class-level guidance.
- `contract-backed`: certification and evidence contracts in `core/contracts/output-contracts.json`.
- `validator-backed`: consistency checks in `scripts/tools/validate-provider-neutral-core.mjs` plus fixture-backed evals.
- `runtime-implemented`: bounded to actual validator/eval runs and generated artifacts; no live runtime workflow engine is claimed.
