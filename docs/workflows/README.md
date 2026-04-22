# Workflow Deep Dives

Class: canonical.
Use rule: use this subtree for workflow-class deep dives that extend `WORKFLOW.md` without redefining root taxonomy or authority order.

## Objective

Provide canonical deep-dive references for workflow-class machine-readable routing and validation posture.

## Relationship To WORKFLOW.md

- `WORKFLOW.md` remains the root workflow taxonomy, phase order, routing rules, validation posture, and stop-condition contract.
- `docs/workflows/*` is a bounded deep-dive layer for class-level mapping detail.
- Canonical machine-readable workflow linkage remains in `core/contracts/workflow-routing-map.json`.

## Canonical Deep-Dive Surfaces

- `core/contracts/workflow-routing-map.json`: canonical workflow-class mapping to skills, control-plane skills, tool intents, tool contracts, MCP posture, validation posture, and expected output contracts.
- `core/contracts/workflow-routing-map.json`: also declares required evidence artifacts and completion posture per workflow class.
- `core/contracts/output-contracts.json`: canonical artifact contracts for workflow plan, run summary, validation summary, and certification summary evidence.
- `templates/codex-workflow/README.md`: canonical template index linking task/review/handoff templates to workflow classes and contracts.
- `templates/codex-workflow/task-packet-template.md`: task packet scaffold for `workflow-plan-v1`.
- `templates/codex-workflow/review-summary-template.md`: review/certification scaffold for workflow validation and certification artifacts.
- `templates/codex-workflow/handoff-summary-template.md`: execution handoff scaffold for workflow run/handoff artifacts.
- `examples/codex-workflow/README.md`: derived example index linking bounded examples to workflow classes, contracts, and templates.
- `core/contracts/core-registry.json`: validator-backed neutral registry snapshot including workflow mappings.
- `evals/fixtures/workflow-routing-map.json`: certification fixture that checks workflow-map coverage in the registry export.
- `evals/fixtures/workflow-execution-evidence.json`: certification fixture that checks completion posture and required evidence contract expectations.
- `evals/fixtures/provider-export-alignment.json`: certification fixture that checks provider exports remain projections of canonical contract ownership.

## Workflow-Class Deep Dives

- `implementation-and-handoff.md`: class-level guidance for `implementation` and `migration-and-compatibility` execution/handoff evidence posture.
- `verification-and-certification.md`: class-level guidance for `verification-and-review` and `readiness-and-release-review` validation/certification posture.

## Coverage Posture

- Workflow class coverage declarations live in `core/contracts/workflow-routing-map.json` via `workflowClassCoverage`, `workflowClassCoverageNotes`, and `exampleArtifacts`.
- `covered` means at least one canonical example artifact is explicitly linked for that class.
- `partial` means class-level mapping is canonical and validator-backed but no dedicated canonical example exists yet.
- Coverage declarations are validator-backed; examples remain derived artifacts and do not become authority surfaces.

## Maturity Posture

- `prose-governed`: `WORKFLOW.md` and this document describe workflow semantics and boundaries.
- `contract-backed`: `core/contracts/workflow-routing-map.json` and `core/contracts/output-contracts.json` define machine-readable workflow mapping and artifact contracts.
- `validator-backed`: `scripts/tools/validate-provider-neutral-core.mjs` checks workflow mapping consistency against skills, tools, and contracts.
- `runtime-implemented`: not claimed for workflow orchestration control plane in this repo; runtime proof remains bounded to concrete scripts and generated artifacts.
