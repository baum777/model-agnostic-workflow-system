# Changelog

## Unreleased

- SII target specification revised v0.1.0 → v0.2.0 (MAWS-SII-TARGET-SPEC-001, still PROPOSED): the existing Skill Intelligence & Instruction Integrity body is extended, not replaced. (1) Separate harness contexts (§ 4.3, slice S11): Development Harness and UNITERA Product Harness as separately authorized execution contexts — a development-harness permission never implies product-runtime authority, a context change is a bound plan revision, and executor bindings carry their context. (2) Model-adaptive executor profiles (§ 11.5, slice S12): a versioned presentation/interaction layer above the unchanged `core/contracts/execution-profile.schema.json` qualification dimensions; task scope, authority, tool rights, security controls, completion criteria and evidence requirements remain identical across models. (3) A comparative benchmark harness (§ 10.6, slice S13): single-executor baseline against a policy-bounded multi-executor alternative, measuring tokens, cost, latency, intervention count, verification success and artifact quality, with context isolation and inherited authority/budget boundaries checked. Two clarifications: context ownership against the coreos-owned Context Compiler (§ 3.4, § 7.5 — MAWS introduces no second context compiler and no second canonical context manifest) and the declared coverage boundary of the instruction-audit taxonomy (§ 6.6 — absence of findings in a class declared not statically analyzable is a declared limitation, not a clean bill). The already-merged slices S0–S3 and the S4 wave A instruction reduction are neither restarted nor retroactively declared complete; the status stays PROPOSED and canonical adoption remains a separate governance step.
- SII S3 repair round — codex findings on the instruction auditor (MAWS-SII-TARGET-SPEC-001): (1) the audit CLI now verifies the requested revision fail-closed before emitting a report — `--revision` must resolve to a real commit, must be exactly HEAD of the audited tree, and the tracked tree must be clean, otherwise the tool exits 2 with `AUDIT_REVISION_UNVERIFIED` and writes no report (an unstamped or falsely stamped revision would make the report unreconstructable); (2) the finding identity now includes the graph edge kind, so the same missing target on one line arriving as both a markdown link and an inline path yields two distinct `finding_id`s instead of colliding; (3) the `line_range` ordering invariant (`start <= end`) is enforced by the new `semanticFindingIssues` check applied on top of schema validation in every validation path, backed by a separate semantic fixture set (`evals/fixtures/maws-vnext-semantic/`, deliberately outside the generic eval catalog because that runner applies schema validation only). Tests `tests/vnext/instruction-auditor.test.mjs` now 9; suite 318/318. All findings were raised by the codex review at `2603ba3` after the PR #26 merge and are repaired here before the pending registry CONTRACT_RECORD write.
- SII S1 repair round — codex P2 findings on the skill-feedback contract (MAWS-SII-TARGET-SPEC-001): (1) `evidence_refs` items now carry a closed source-kind scheme (`artifact:`, `edge:`, `eval:`, `file:`, `graph:`, `operator:`, `path:`, `review:`, `run:`, `sandbox:`, `session:`, `ticket:`, `url:`), so model self-report is structurally excluded from evidence — no self-report scheme exists and unmarked refs are rejected; (2) records with `error_class` `TOOL_CONTRACT_ERROR` can never carry the skill-changing dispositions `EXTEND_SKILL`/`CREATE_SKILL` (fail-closed if/then narrowing; owner review does not legitimize a skill change for a tool-only cause), per spec 8.4. Fixtures extended to 21 cases (5 positive / 16 negative) incl. the two new negative classes; tests `tests/vnext/skill-feedback.test.mjs` now 10 with meta-assertions for both rules. Both findings were raised by the codex review at `613a5e7` after the PR #22 merge and are repaired here before the pending registry CONTRACT_RECORD write.
- SII implementation slice S3 — instruction auditor (MAWS-SII-TARGET-SPEC-001): new canonical contract `core/contracts/instruction-audit-finding.schema.json` for one instruction-integrity audit finding (spec 6.2 closed 10-class taxonomy, 6.4 finding contract with deterministic provenance and 1-based line ranges) plus the read-only auditor `runtime/instructions/instruction-auditor.mjs` over the S2 reference graph. Wave 1 analyzes the two statically decidable classes (`STALE_REFERENCE` high risk, `INVALID_COMMAND` medium risk) and honestly declares the remaining eight as not statically analyzable in the audit coverage instead of emitting heuristic guesses. Fail-closed schema rules: `semantic_advisory` findings can never carry `blocker` risk; `blocker` risk and the `AUTHORITY_LEAK` class always force `requires_owner_review`. Validator/audit CLI `npm run validate-instruction-integrity` (fixture mode: 18 cases, 5 positive / 13 negative; `--revision` mode: live audit with contract round-trip validation, `--output` persistence, `--fail-on-blocker` opt-in — default advisory, findings gate nothing). Fixture `evals/fixtures/maws-vnext/instruction-audit-findings.contracts.json` registered in `evals/catalog.json`, covered by `eval:maws-vnext`; tests `tests/vnext/instruction-auditor.test.mjs`. Live audit at main `2eff613`: 10 STALE_REFERENCE findings (0 blocker, 0 contract violations), report under `evidence/instruction-auditor-2026-10-20/`. A finding is analysis output, never authority: it mutates nothing, gates nothing by itself, and replaces no approval decision.
- SII implementation slice S2 wave 2 — instruction reference graph (MAWS-SII-TARGET-SPEC-001): new read-only module `runtime/instructions/instruction-resolver.mjs` builds the deterministic file-/import-/reference graph over the wave 1 inventory source set under a closed extraction rule set (markdown links resolve document-relative, path-shaped code spans resolve repository-root-relative, `npm run` code spans resolve against the package.json scripts map). Dangling references are recorded as data (`resolved`/`dangling` status with line numbers) and folded into a revision-bound graph digest. Fail-closed: missing revision (`INVENTORY_REVISION_REQUIRED`, inherited) and command references without a readable package.json (`INSTRUCTION_PACKAGE_MANIFEST_MISSING`). Stdout-only CLI `scripts/tools/build-instruction-graph.mjs` (`--revision` mandatory, `--dangling` filter), tests `tests/vnext/instruction-resolver.test.mjs` (6 tests incl. read-only byte-identity proof). Live-tree observation at main `87a86d54`: 10 dangling references across instruction sources — recorded as analysis input for the S3 auditor; this slice creates no findings contract and no authority surface.
- SII implementation slice S2 wave 1 — instruction inventory (MAWS-SII-TARGET-SPEC-001): new read-only module `runtime/instructions/instruction-inventory.mjs` makes the canonical instruction sources reconstructable — declared fixed source set (root governance, workflow contract, authority hierarchy/matrix, core prompt architecture, routing/permission/memory contracts) plus enumerated skill instruction files (`core/skills/*/SKILL.md`, `.agents/skills/*/SKILL.md`), each bound to its content via sha256, with a deterministic inventory digest over revision + source digests and fail-closed errors on missing sources or a missing revision binding. Stdout-only CLI `scripts/tools/build-instruction-inventory.mjs --revision <sha>` (never writes, never spawns). Tests `tests/vnext/instruction-inventory.test.mjs` include a byte-identical read-only proof. Analysis surface only: grants no permission, loads nothing into any runtime, activates nothing. Wave 2 (reference graph) and the auditor (S3) remain open.
- SII implementation slice S1 — feedback contract (MAWS-SII-TARGET-SPEC-001): new canonical contract `core/contracts/skill-feedback.schema.json` for structured, versioned Skill Intelligence feedback records (spec 8.2 source taxonomy with model self-report deterministically excluded, 8.3 closed error-class taxonomy, 9 Stage-3 disposition vocabulary without PROMOTE/APPLY, run-/skill-/executor-bindings, provenance and evidence refs). Fail-closed if/then rules: `UNKNOWN_ROOT_CAUSE` records and `CREATE_SKILL` proposals always require owner review. Validator `npm run validate-skill-feedback` (fixtures + explicit records), fixture `evals/fixtures/maws-vnext/skill-feedback.contracts.json` registered in `evals/catalog.json` (5 positive / 11 negative cases, covered by `eval:maws-vnext`), tests `tests/vnext/skill-feedback.test.mjs`. Feedback is analysis input, never authority: a valid record grants no permission, promotes no skill, and changes no qualification state.
- SII materialization wave 0 (MAWS-SII-TARGET-SPEC-001 v0.1.0, PROPOSED): the Skill Intelligence & Instruction Integrity target specification is materialized verbatim under `docs/proposals/skill-intelligence-target-spec.md` together with the evidence-backed current-state map `docs/proposals/skill-intelligence-current-state-map-2026-10-20.md` (S0 reconciliation against main `dcd95bf2`: 18/18 baseline components confirmed, 6/6 extension gaps confirmed real, 16/16 proposed paths collision-free). Docs-only proposal staging per `docs/proposals/README.md`; non-canonical until a separate owner-approved promotion slice; no runtime, contract, or authority surface created.
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
