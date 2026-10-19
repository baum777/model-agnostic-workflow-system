# RUN — execution-intake-binding (S2b wave 1)

Run: OWNER-DIRECTED-CONSOLIDATION-RUN-2026-10-19 — step S2b, wave 1.
Scope source: `.consolidation-run-20261019/S2B-SCOPE.md` (project side).
Worktree: `.worktrees/s2b-intake-20261020`, stacked on the P1-hardening branch
`impl/runtime-run-p1-hardening-20261020` (PR #13) off origin/main `6d399d62`.
Implementation commit: `04877451346321d2252ce900f098b167aff6dae0`.

## Change

Binds a WorkUnit node to the Unitera Systems execution-control chain
(prepare → evaluate → clearances → authorize → execute → reconcile) as an
executor behind the existing eligibility/routing model — no parallel control
model (audit finding: consolidate, not new concepts):

1. **New canonical contract** `core/contracts/execution-intake-binding.schema.json`
   (CONTRACT_RECORD class): binding_id/work_unit_id, target
   (system `unitera_systems_execution_control`, transport enum `fixture`),
   capability_mapping (MAWS capability → Systems capability/operation/target,
   Systems capability enum mirrors the Systems DB CHECK), rights_transition
   (authority_ceiling_ref, allowed_effects, `external_commit`,
   credential_model `none_wave1_fixture`|`jwt_service_principal_owner_gated`),
   evidence_transition (Systems read-model → MAWS verification receipts),
   outcome_semantics (`business_outcome: not_asserted` const), and
   commitment_context (commitment_run_id + commitment_approval_decision_id —
   Systems ExecutionIntents are commitment-run-bound; wave 1 carries the
   context as fixture data for the live wave).
2. **Fixture executor** `runtime/intake/execution-control-fixture.mjs`
   (`exec_unitera_execution_control_fixture`, deterministic_service, declared
   in `runtime/executors/registry.default.json`): simulates the Systems chain
   deterministically in process; enforces the binding deny-by-default at
   runtime (`INTAKE_WORK_UNIT_MISMATCH`, `INTAKE_AUTHORITY_ENVELOPE_MISMATCH`
   on scope or effect-grant mismatch); emits the derived binding record with
   `business_outcome: 'not_asserted'` by construction.
3. **CLI** (`runtime/cli/runtime-run.mjs`): new validated spec part
   `intake_bindings` (`SPEC_INTAKE_BINDING_INVALID`); explicit live fail-closed
   `RUN_INTAKE_TRANSPORT_UNSUPPORTED`; evidence bundle gains
   `intent-bindings.json`; summary gains `intake_bindings`.
4. **Reference spec** `runtime/cli/specs/reference-audit-v1.json`: new `effect`
   stage between analysis and verification, bound through the intake binding
   (`eib_reference_email_send_0001`, email.send mapping, fixture commitment
   context); qualification + fingerprints + qualified snapshots for the new
   executor.
5. **Docs**: `core/contracts/README.md` (canonical list + posture paragraph),
   `docs/runtime.md` (intake section), `CHANGELOG.md`.

## Safety posture (deliberate)

Fixture only — no network, no credentials, no Systems-side change of any
kind. The live HTTP intake is deliberately not wired: Unitera Systems has no
service-principal auth lane today (JWT principals map to human actors only),
so live intake is owner-gated wave 2 (OD-NEW-2 in the scope doc). The binding
carries no authority; the Systems chain remains the authority for external
effects. `business_outcome` stays `not_asserted` until Systems-side
verification read-model evidence exists (guest semantics, no parallel MAWS
outcome model — OD-NEW-1 recommendation implemented).

## Verification

- `node --test tests/vnext/runtime-run-intake.test.mjs` — 7/7 (happy path
  with intent-bindings.json + honest outcome semantics; live transport cannot
  validate; wrong executor key; missing executor binding; scope mismatch;
  missing effect grant; foreign work unit).
- `npm run test:vnext` — **274/274** (7 new intake tests; executor-registry
  expectations extended to the fifth executor; CLI writeSpec helper re-points
  the intake binding when a test renames the run).
- `npm run validate` — PASS; `npm run validate-maws-vnext` — PASS (no
  authority-matrix overclaim; the contract is contract-backed and enforced by
  the runtime spec gate).
- Registry disposition: `registry-disposition.json` in this directory —
  **CONTRACT_RECORD class, REQUIRED_BUT_BLOCKED** (new canonical contract;
  registry projection follows as its own registered change after owner merge).

## Not claimed

- No live Systems integration, no HTTP, no credentials, no Systems repo
  change; no autonomy/context-budget enforcement (S3); no Atlas
  file-relations change (the new MAWS↔Systems execution-control topology edge
  belongs to the merge projection of this change); no adoption of the S1-C
  mapping candidate (owner decision §5).
