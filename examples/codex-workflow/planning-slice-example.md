# Planning Slice Example

## WORKFLOW COVERAGE
- Workflow class: `implementation-planning`
- Supporting skills: `planning-slice-builder`, `spec-to-task-breakdown`, `migration-planner`, `test-matrix-builder`
- Output contracts: `workflow-plan-v1`, `workflow-validation-summary-v1`
- Template source: `templates/codex-workflow/task-packet-template.md`
- Validation posture: `validate-provider-neutral-core` as blocking gate

## SUMMARY
Convert a broad change request into bounded waves.

## WORKFLOW CLASS
implementation-planning

## AUTHORITY SOURCES
- `WORKFLOW.md`
- `core/contracts/workflow-routing-map.json`
- `core/contracts/output-contracts.json`

## ROUTING DECISION
Primary shape: implementation-plan.

## IMPLEMENTATION PHASES
1. Contract extraction.
2. Minimal implementation.
3. Gate checks.
4. Review and handover.

## VALIDATION POSTURE
- Blocking gates: `npm run validate`, `npm run validate-neutral`, `npm run eval`

## STOP CONDITIONS
- Conflicting authority with no resolver.
- Missing blocking gate evidence.

## GAPS
- Pending implementation write evidence is out of scope for this planning artifact.

## NEXT ACTIONS
- Execute smallest safe slice and produce workflow run/handoff evidence.
