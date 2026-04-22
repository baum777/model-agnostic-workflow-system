# Review Summary Example

## WORKFLOW COVERAGE
- Workflow class: `verification-and-review`
- Supporting skills: `readiness-check`, `post-implementation-review-writer`, `test-matrix-builder`, `failure-mode-enumerator`
- Output contracts: `workflow-validation-summary-v1`, `workflow-certification-summary-v1`
- Template source: `templates/codex-workflow/review-summary-template.md`
- Validation posture: `validate-repo-surface`, `validate-provider-neutral-core`, `run-certification-evals`

## SUMMARY
Summarize the change, verification, and residual risk.

## WORKFLOW CLASS
verification-and-review

## VALIDATION SCOPE
Canonical workflow and provider-export alignment checks.

## BLOCKING GATES
- `npm run validate`: passed
- `npm run validate-neutral`: passed
- `npm run eval`: passed

## ADVISORY GATES
- none

## EVIDENCE REFERENCES
- `core/contracts/core-registry.json`
- `providers/openai-codex/export.json`

## VERDICT
PASS

## CERTIFICATION SCOPE
Provider-neutral workflow export parity.

## REQUIRED CONTRACT SURFACES
- `core/contracts/workflow-routing-map.json`
- `core/contracts/output-contracts.json`
- `core/contracts/portable-skill-manifest.json`

## REQUIRED VALIDATION RUNS
- `npm run validate`
- `npm run validate-neutral`
- `npm run eval`

## REQUIRED EVIDENCE ARTIFACTS
- `workflow-validation-summary-v1`
- `workflow-certification-summary-v1`

## COMPATIBILITY/EXPORT STATUS
Compatibility exports are preserved as derived mirrors of canonical contracts.

## CERTIFICATION DECISION
CERTIFIED

## RESIDUAL RISKS
- Remaining risks are explicit and bounded.

## OPEN GAPS
- No additional blocking gaps.

## NEXT GATE
- Ready for handoff/release review.
