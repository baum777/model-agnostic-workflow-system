# RUN — execution-intake-binding (S2b wave 1)

Run: OWNER-DIRECTED-CONSOLIDATION-RUN-2026-10-19 — step S2b, wave 1.
Scope source: `.consolidation-run-20261019/S2B-SCOPE.md` (project side).
Worktree: `.worktrees/s2b-intake-20261020`, stacked on the P1-hardening branch
`impl/runtime-run-p1-hardening-20261020` (PR #13, merged as `4212b594`) off
origin/main `6d399d62`.
Implementation commits: wave 1 `04877451346321d2252ce900f098b167aff6dae0`,
review round `33933434414b8df9b0f659adbb6325493c6a7dc7` (bound in
registry-disposition.json; baseline re-read at the post-#208/#209 registry
main `d5c76040`).

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

## Round 2 — Codex review on wave 1 (P1 x2, P2 x2), repaired before merge

7. **Unbound execution-control executor** (P1): `executor_bindings` naming the
   fixture executor without an `intake_bindings` entry silently fell back to
   the generic fixture executor. Now fails closed
   (`SPEC_INTAKE_BINDING_INVALID`, "may never run unbound").
8. **Unbound capability mapping** (P1): the recorded
   `maws_capability_id` was never checked against the routed capability.
   Now must be among the executor manifest's declared capabilities
   (`SPEC_INTAKE_BINDING_INVALID` otherwise) — the mapping attests what was
   routed.
9. **Snapshot keying** (P2): `qualified_fingerprints` was keyed by executor
   only, unrepresentable for executors with multiple qualification scopes.
   Now keyed by the qualification's `fingerprint_ref` (one snapshot per
   executor+capability+profile); the qualification binding check compares
   executor, capability and profile. The engine's eligibility consumes one
   snapshot per executor, so the runner translates the per-scope spec part
   into that shape and fails closed if one executor would need two different
   snapshots (lossy translation is never silent; the engine is unchanged).
10. **Honest failure evidence** (P2): a FAILED fixture outcome previously
    recorded an all-OK chain with status `executed`. Now `execute` is FAILED,
    `reconcile` NOT_RUN, record status `failed`.

## Disposition closure (2026-10-20)

The registry projection merged as
`9ef65e36965e5e8cf612c2a3e94c83b44afd0e2d` (registry PR
projection/maws-intake-binding-20261020: change registration
`MAWS_EXECUTION_INTAKE_BINDING_2026_10_20_001.yaml` plus the machine-readable
CONTRACT_RECORD projection `MAWS_EXECUTION_INTAKE_BINDING_CONTRACT_2026_10_20_001.yaml`;
companion hardening registration `MAWS_RUNTIME_RUN_P1_HARDENING_2026_10_20_001.yaml`
merged as `c2554a34`). `registry-disposition.json` in this directory is
rebound to **UPDATED** with `registry_commit_sha` `9ef65e36`; the Atlas
representation (claims, audits note, declared fixture-only
execution-control-intake edge, human-readable relation updates) merged as
`900f0c65` (atlas PR claims/maws-s2b-hardening-intake-20261020).

Round-2 verification: intake tests 12/12 (five new: unbound executor,
capability mismatch, FAILED outcome evidence, per-scope snapshot keying plus
the carried re-keyed snapshot-binding test), full suite 279/279, validators
PASS (see PR checks and the rebound disposition below).

## Not claimed

- No live Systems integration, no HTTP, no credentials, no Systems repo
  change; no autonomy/context-budget enforcement (S3); no Atlas
  file-relations change (the new MAWS↔Systems execution-control topology edge
  belongs to the merge projection of this change); no adoption of the S1-C
  mapping candidate (owner decision §5).
