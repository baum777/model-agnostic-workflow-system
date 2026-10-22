# S10 — Cross-Model Optimization implementation run — 2026-10-22

Run: owner instruction of 2026-10-22 ("MAWS-SII — S10 Cross-Model
Optimization Run / Mode: Scoped · Evidence-first · Model-agnostic ·
Fail-closed"), five phases, baseline S9 CLOSED, development target OD-20.
Scope S10 only, no runtime activation.

## Spec binding

`docs/proposals/skill-intelligence-target-spec.md`
(`MAWS-SII-TARGET-SPEC-001` v0.2.0), section 15 slice S10 (Cross-Model
Optimization), adopted as the Shared-Core development target by OD-20 in
`docs/maws-vnext-owner-decisions.md`. The slice is the last open slice of
the specification's section 15.

## Reconciliation (Phase 1, read-only)

- MAWS main at run start: `86aa13b98c0d5738ab7008230144f080690c9177`; S9
  fully merged (implementation `5b5319e`, merge `2965a3b`); the concurrent
  lanes #87–#93 touched assurance-reconciliation evidence only, no overlap
  with S10 surfaces.
- Reused, not duplicated: `core/contracts/qualification-record.schema.json`
  (qualification state and evidence), `qualification-fingerprint`,
  `executor-model-profile`, `benchmark-record` (the variantMeasures metric
  vocabulary), the S9 regression gate
  (`runtime/regression/regression-gate.mjs`), and the common schema defs
  (`executorId`, `qualificationState`, `stringRefs`). No competing routing
  authority is created: `routing-decision`, `routing-request`,
  `workflow-routing-map` and the routing engine are untouched; an S10 record
  never reroutes anything.
- The authority-matrix family row for S9 has NOT been re-pinned (the
  instruction-digest re-pin lane is still open), so S10 follows the S9
  precedent: no authority-matrix row in this slice either, deferral
  registered in the Registry change registration. `docs/authority-matrix.md`
  was not touched — editing it would invalidate the pinned instruction
  digests of the frozen experiments and fail the intake suites closed.

## Change (Phases 2 and 3)

- `core/contracts/cross-model-comparison.schema.json` (new, v1.0.0): the
  comparison contract. A record binds one task set, one corpus digest, one
  success contract and one declared evidence class; each candidate carries
  its ACTUALLY measured basis, explicit executor/provider/model versions,
  separate capability and qualification evidence, an S9 regression verdict
  reference, quality/security/latency/token measurements including an
  instruction-overhead block (instruction_tokens, task_tokens, derived
  overhead_ratio), stability and execution status. Verdicts
  CANDIDATE_PREFERRED | INCOMPARABLE | BLOCKED with typed outcome reasons;
  if/then branches bind verdict to reason set and preferred-candidate
  shape; `live_provider` evidence requires an owner budget authorization
  reference; `adoption_authorized`, `authority_granted`, `routing_changed`
  are const false and `runtime_activation` const NONE.
- `runtime/optimization/cross-model-comparison.mjs` (new): the deterministic,
  pure engine. Fixed fail-closed gate order: ADAPTER_BOUNDARY (a
  model-specific optimization that is not adapter-bound blocks the whole
  comparison) → EVIDENCE_COMPLETENESS (a failed execution or a missing
  quality/token/latency comparison metric ⇒ BLOCKED with a typed reason —
  missing evidence for one candidate is missing evidence for the record) →
  COMPARABILITY (a candidate measured against another task set, corpus,
  success contract or evidence class ⇒ INCOMPARABLE, never silently
  normalized) → CAPABILITY → QUALIFICATION (only QUALIFIED with carried
  evidence is winner-capable; UNKNOWN or QUALIFIED-without-evidence is
  missing evidence; an all-unproven field is BLOCKED, an all-unqualified
  field is INCOMPARABLE with no winner-capable candidate) → REGRESSION (the
  S9 integration: NO_REGRESSION with a bound record keeps a candidate
  capable, REGRESSION_DETECTED excludes it, a missing or BLOCKED S9 verdict
  is missing evidence, and an all-unevidenced field is BLOCKED) →
  SECURITY_ABSOLUTE (any security regression excludes a candidate
  absolutely; no quality, cost or latency gain compensates it) → STABILITY
  (unstable repetitions exclude a candidate; an all-unstable field is
  INCOMPARABLE — present-but-unusable evidence, not missing) → PARETO
  (cost/token optimization only among the survivors; a preference requires
  dominance over every other winner-capable candidate on quality
  (higher), cost units, total tokens and tail latency (lower); a single
  survivor of the gates is not a comparison result; equal metrics name no
  winner — there is no implicit success threshold).
- Provider and harness differences are DERIVED and classified
  (MODEL/PROVIDER/EXECUTOR/HARNESS/NONE) from the winner-capable field,
  never asserted by the caller.
- `scripts/tools/validate-cross-model-comparison.mjs` (new): schema plus the
  fail-closed semantic invariants X1–X10 (candidate set and deterministic
  identity; verdict/reason/preferred consistency; winner capability and
  dominance re-derivation of the preferred candidate; absolute security
  exclusion; comparability flags re-derived from the measured bases;
  overhead ratio recomputed from components; authority-free posture;
  live-evidence authorization rule; the closed gate sequence in order; the
  adapter-boundary rule).
- `scripts/tools/run-cross-model-eval.mjs` (new) and
  `evals/s10-cross-model/corpus.json` (new): the independent corpus (Phase
  4) and its runner. 17 cases: the ten owner-ordered case classes
  (same quality/different cost; cheaper but worse; security regression
  despite a performance gain; incompatible capability; missing
  qualification; corpus, success-contract and evidence-class mismatch;
  unstable repetitions; provider/executor failure; missing token/latency
  evidence; a candidate failing the S9 gate) plus supplementary branches
  (full dominance, pure quality dominance, purely unqualified states,
  adapter-boundary violation, missing S9 evidence everywhere). Expectations
  are fixed in the committed corpus before the runner executes; the runner
  additionally validates every produced record against the contract and
  proves determinism by double execution.
- `evals/fixtures/maws-vnext/cross-model-comparison.contracts.json` (new):
  10 schema-decidable contract cases (6 valid across all three verdict
  classes, 4 invalid). The semantic-only negatives (winner capability,
  dominance, security exclusion, comparability flags, overhead ratio, gate
  order, blocked-gate log, adapter boundary) live as tamper tests in
  `tests/vnext/cross-model-eval.test.mjs` (new, 19 tests) because the
  shared fixture validator judges schema decidability only.
- Wiring: package scripts `eval:cross-model` and
  `validate-cross-model-comparison`; catalog entry; CI step
  "Cross-model comparison gates (S10)"; assurance gate
  `cross-model-comparison-gates` with its artifact list
  (`capture-assurance-run.mjs`).
- Docs: the spec's section 15 S10 carries its implementation and
  measurement subsections and is fully checked; the status block now
  carries S10 as implemented (all slices S0–S13 implemented by slice) with
  the owner gates unchanged; CHANGELOG entry.

## Safety posture (deliberate)

- The record is an evaluation result, never authority: model switch,
  qualification and authority grant stay three separate decisions in three
  separate contracts. No routing table, provider registry or executor
  surface is touched; no runtime activation happens.
- Security is absolute and uncompensable; the S9 regression gate is
  integrated as a precondition of winner status, and the absence of an S9
  record is treated as missing evidence, never as cleanliness.
- Cost and token optimization happens only between sufficiently qualified
  candidates; an unqualified executor never receives winner status.
- Offline replay/fixture evidence is its own declared evidence class; the
  `live_provider` class exists in the contract but is never exercised
  because no owner budget authorization exists in this run. No provider was
  called, no credentials exist in any S10 artifact, and no network access
  is performed by the engine, validator, runner or tests.
- A CANDIDATE_PREFERRED verdict adopts nothing: the promotion path of S8/S9
  remains the only way to an adoption.

## Findings of the run (defects the run itself caught)

1. The first engine version mixed the corpus digest into the
   `same_task_set` comparability flag while the validator re-derived that
   flag over the task-set id only — the corpus' corpus-mismatch case
   exposed the disagreement. Fixed by decoupling the flags: the id is the
   identity, the digest is its own flag, either mismatch makes the record
   INCOMPARABLE.
2. The first runner version passed the corpus input object through with
   snake_case keys (`optimization_boundaries`, `evidence_refs`) that the
   engine API does not read (camelCase) — the adapter-boundary case
   silently lost its boundaries and ran to a Pareto verdict. Fixed with an
   explicit, lossless key translation at the runner boundary.
3. The first fixture draft placed semantic-only negative cases in the
   shared maws-vnext fixture file; the shared validator judges schema
   decidability and rejected them as "expected invalid but observed valid".
   Resolved honestly: the schema gained if/then branches for the
   schema-decidable invariants (verdict→reason set, verdict→preferred
   shape, live-evidence authorization), the four such cases stayed in the
   shared fixture, and the eight semantic-only negatives became tamper
   tests in the test suite.
4. The adapter-boundary validator rule initially contradicted itself: a
   faithful BLOCKED-on-boundary record legitimately CONTAINS the violating
   entry as evidence. The rule now binds the entries a record acts on, not
   the one it refused.
5. tmpfs filled again during the run (5.1G of 7.5G, foreign lane
   artifacts); no foreign /tmp content was deleted — the run's own
   temporary directory moved to disk (`TMPDIR` on the workspace volume).
6. The instruction-digest re-pin lane (S5-boundaries, PRs #95–#98) merged
   on main WHILE this lane was under review: main advanced from `86aa13b`
   past the governance binding merges to `7c6e34c`, the pull request
   became unmergeable (`mergeable=false`), and the rebase of this lane
   conflicted on `CHANGELOG.md` and the CI workflow. Resolution: both
   sides kept (the concurrent lane's changelog entry and workflow steps
   plus this lane's), the branch was rebuilt as one implementation commit
   and one evidence commit on the new base, the full battery was re-run at
   the new head (844/844, all validators PASS), and the assurance record
   was re-captured in a clean clone of the new implementation commit — the
   record bound to the orphaned first base was discarded, not amended. The
   lane authorization had already been published for the orphaned head
   (`6e3c3280…`, governance PR #102) and authorizes nothing for the new
   head; the corrected binding (`authorized_head_sha` = the rebuilt
   evidence head) follows on main before the merge, following the S9
   precedent of the SHA-correction governance commit. One reconciliation
   statement above is therefore historical, not current: the re-pin was
   open at run start (Phase 1) and has since landed; the S10 family-row
   deferral in this slice remains deliberate (adding a row would again
   move the just-re-pinned instruction digests).

## Verification (at the bound commit, in a clean clone)

- `npm run validate`: PASS (no issues).
- `npm run validate-maws-vnext`: PASS (28 fixture files, 307 cases).
- `npm run validate-regression-comparison` + `npm run eval:regression`
  (S9 gates preserved): PASS.
- `npm run validate-cross-model-comparison`: 10/10 fixture cases as
  expected.
- `npm run eval:cross-model`: 17/17 corpus cases as expected,
  deterministic; verdict coverage BLOCKED, INCOMPARABLE, CANDIDATE_PREFERRED.
- `npm run test:vnext`: 844/844 PASS (825 before this change + 19 new).
- Assurance run record `run-record.json` (captured in a CLEAN CLONE of the
  bound implementation commit `8f69d155b0b280efbb802775efda25f2f521e62c`
  (rebuilt on main `7c6e34c` after the concurrent re-pin lane landed),
  `npm ci --ignore-scripts`, no dirty tree): 22/22 gates passed, 1028
  tests passed, 0 failed, 39 artifacts digested; `validate:assurance-run
  --all` PASS over all four committed records.
- Every result above is a LOCAL measurement at the stated commit
  (`ci_parity: LOCAL_REPLICATION`, `hosted_ci_executed: false`). The
  account's hosted Actions admission remains closed (registry finding
  F-09, owner-gated); no hosted CI result is claimed.

## Not claimed

- No authority, adoption, qualification, activation, runtime capability,
  routing change or provider activation is created by this run. A
  preference in the corpus is a measured statement over synthetic
  material.
- The corpus labels and expectations are constructed, not owner-reviewed;
  all measurements are synthetic offline replay/fixture evidence over
  synthetic executor identities. No statement about any real model or
  provider is derivable from this run.
- The instruction overhead numbers exercise the derived-ratio invariant;
  they are not measured tokenizations.
- No security claim is derived from the pre-commit scan: the session's
  scan is inconclusive (scanner_enobufs).
- The authority-matrix family row for S9 and S10 stays deferred to the
  open instruction-digest re-pin lane (same reason as S9: editing
  `docs/authority-matrix.md` invalidates the pinned experiment digests).
- The owner gates are untouched and stay open: the owner review of the
  advisory candidates (wave 2 and S10), F-09 (hosted Actions admission),
  OA-02 (signing history), OA-03a/OA-03b, the Registry `CONTRACT_RECORD`
  arrears for S1, the document-surface placement of the specification, and
  the instruction-digest re-pin lane.
