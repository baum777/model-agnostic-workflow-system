# Changelog

## Unreleased

- `runtime:run` is now an operational entry point for the governed vNext run pipeline (previously a Phase-1 stub): loads a run spec, validates spec parts against the canonical contracts, drives `executeWorkRun` end to end, and persists the evidence bundle plus `run-events.jsonl` under `artifacts/runtime-runs/<runId>/`.
- Fixture transports only; live transports fail closed with `RUN_SPEC_TRANSPORT_UNSUPPORTED` (no fallback). Live lane probes remain `runtime:activate-vnext`.
- Availability / policy / budget compatibility are deny-by-default per executor.
- Completion honesty: outputs and evidence are derived from produced execution results and verification receipts, not declared spec intent.
- Added committed reference spec `runtime/cli/specs/reference-audit-v1.json` and CLI qualification tests (`tests/vnext/runtime-run-cli.test.mjs`).
- Hardened the runner against three review findings on the runtime:run entry (Codex P1 x3): verifier declarations must state `outcome`, `independent` and — for PASS — at least one evidence ref explicitly (`SPEC_VERIFIER_INVALID`, no default-PASS attestations); qualified fingerprint snapshots are a separate required spec part `qualified_fingerprints` instead of aliasing the current fingerprints (no manufactured no-drift eligibility); a non-empty run directory fails closed with `RUN_DIR_EXISTS` instead of being silently reused.
- Second hardening round (Codex P1 x3 on the first round): run directories are claimed exclusively via atomic creation (concurrent same-spec runs can never interleave event streams, even when the directory is still empty); qualified snapshots are bound to their qualification records (fingerprint_ref, capability and profile must match — an unrelated schema-valid snapshot no longer satisfies the drift check); the verifier declaration must match the executor routing actually binds to the verification node (`SPEC_VERIFIER_MISMATCH` — a declared-but-not-executed verifier id never attests anything).
- S2b wave 1 — intake binding (WorkUnit -> Unitera Systems execution-control): new canonical contract `core/contracts/execution-intake-binding.schema.json` (capability mapping, rights/credential transition, evidence transition, outcome semantics); new fixture executor `exec_unitera_execution_control_fixture` (`runtime/intake/execution-control-fixture.mjs`) simulating the Systems chain prepare..reconcile in process; `runtime:run` gains the validated `intake_bindings` spec part (`SPEC_INTAKE_BINDING_INVALID`) and writes `intent-bindings.json` into the run evidence bundle. Fixture-only: live HTTP intake fails closed (`RUN_INTAKE_TRANSPORT_UNSUPPORTED`, owner-gated wave 2 auth lane); `business_outcome` stays `not_asserted` until Systems-side verification read-model evidence exists.
- Intake-binding review round (Codex P1 x2, P2 x2): the execution-control executor may never run unbound (an `executor_bindings` entry without `intake_bindings` fails closed instead of silently falling back to the generic fixture executor); the recorded capability mapping must be a capability the executor actually declares (the mapping attests what was routed); `qualified_fingerprints` snapshots are keyed by the qualification's `fingerprint_ref` (one snapshot per executor+capability+profile scope, instead of a single per-executor slot); a FAILED fixture outcome produces honest failure evidence (chain `execute` FAILED, `reconcile` NOT_RUN, record status `failed`).
- S3 wave A — context budgeting in the execution path: new canonical contract `core/contracts/context-envelope.schema.json` (envelope_id, token_budget); `runtime:run` requires the declared `context_envelope`, enforces the deterministic context estimate (objective + bounded payload) AND the declared executor `tokens_in` against the budget fail-closed (`SPEC_CONTEXT_BUDGET_EXCEEDED`, no silent truncation), emits the observability spine's declared `resource.budget_check` event for real, and records declaration, verdict and reported token usage in a `context-envelope.json` evidence artifact. The work unit's `context_envelope_ref` now points at a real declared envelope instead of a synthetic never-resolved string. No live token metering is claimed (declared metrics only).

## 0.3.0 - planned

- Added contract-backed agentic workflow extension modules:
  - OBS - Observability Spine
  - PBC - Permission Boundary Contract
  - WMC - Workflow Memory Contract
  - MAHP - Multi-Agent Handoff Protocol
  - RGC - Resource Governor Contract
  - TSC - Trigger and Scheduling Contract
- Added deterministic eval slices:
  - eval:obs
  - eval:pbc
  - eval:wmc
  - eval:mahp
  - eval:rgc
  - eval:tsc
- Extended portable skill manifest with opt-in/deferred module contract declarations.
- Added examples for MAHP, RGC, and TSC where applicable.
- Preserved provider neutrality.
- Preserved existing consumer opt-in posture.
- Added migration-hardening policy for future opt-in-to-blocking transition; no blocking consumer gates in 0.3.0.
- No runtime implementation, scheduler, memory store, permission engine, transport, budget engine, or enforcement layer added.
- No breaking changes to existing consumers.

## 0.2.2 - 2026-06-25

- Added `loops/tdd-impl-loop/` — a 7-phase TDD implementation loop with command contract, stop rules, prompt template, circling integration, and memory save schema.
- Added `commands/loop-tdd-impl.md` — canonical routing entry for `command/ loop tdd impl <spec>`.
- Registered tdd-impl-loop in `WORKFLOW.md` Routing Rules.

## 0.2.1 - 2026-04-09

- Added generated provider export bundles and the certification eval runner.
- Wired the neutral validator to check provider export artifacts and eval fixtures.
- Brought the package, plugin, README, and generated registry metadata back into version sync.

## 0.2.0 - 2026-04-09

- Introduced provider-neutral contracts and provider adapter scaffolds.
- Added a generated neutral core registry and provider capability matrix.
- Kept the Codex package surface as a compatibility export while the shared core evolves.

## 0.1.4 - 2026-03-29

- Parameterized runtime-policy-auditor as the second shared-with-local-inputs skill.
- Added a local runtime-policy contract validator and consumer linkage checks.
- Updated rollout docs and maintainer commands to distinguish runtime policy from live-readiness.

## 0.1.3 - 2026-03-29

- Parameterized runtime-policy-auditor as the second shared-with-local-inputs skill.
- Added a local runtime-policy contract validator and consumer linkage checks.
- Updated consumer rollout docs and maintainer commands for runtime-policy inputs.

## 0.1.2 - 2026-03-29

- Parameterized repo intake as the first shared-with-local-inputs skill.
- Added a boring local-input contract validator for consumer repos.
- Added shared-core and consumer validation updates for repo-intake inputs.

## 0.1.1 - 2026-03-29

- Added boring maintainer commands for lock refresh, consumer validation, and consumer initialization.
- Added rollout and lock-model documentation for repeatable consumer adoption.
- Added a standardized path for onboarding additional consumer repositories.

## 0.1.0 - 2026-03-29

- First standalone shared-core release.
- Mirrored the proven reusable workflow skills, templates, examples, docs, and helper scripts from the UNITERA staged core.
- Added versioned consumer linkage support for downstream repositories.
