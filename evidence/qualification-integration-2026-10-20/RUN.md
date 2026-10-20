# S7 Run Record — Qualification Integration (2026-10-20)

- Spec binding: `MAWS-SII-TARGET-SPEC-001` v0.2.0 (PROPOSED), slice S7 + sections 11.2/11.3.
- Source of authority: bounded owner run directive of 2026-10-20 ("run S11 implementierung und closure S7, S13 und S8"). Materialization only; the specification stays PROPOSED, no runtime authority is granted, no model or executor is qualified by this slice.
- Branch: `s7/qualification-integration-20261020b`, based on `main` (rebased onto the S11 merge and the disposition-shape repair `eb8d423`). The earlier stacked branch `s7/qualification-integration-20261020` and its pull request were superseded.

## What was implemented

- `core/contracts/qualification-fingerprint.schema.json` — components gain the required `effective_instruction_digest` (`sha256:`-prefixed 64-hex, the instruction-bundle digest form of S6). A qualification is bound to the exact effective instruction set it was earned under.
- `core/contracts/materiality-decision.schema.json` — the delta classification enum is extended with the value the digest delta carries.
- `runtime/qualification/fingerprint.mjs` — `FINGERPRINT_COMPONENT_KEYS` (closed set, fail closed on unexpected keys) gains `effective_instruction_digest`; value validation `^sha256:[a-f0-9]{64}$`; the component may not be null.
- `runtime/qualification/materiality.mjs` — `TRACKED_COMPONENTS` gains the digest: a digest delta is `MATERIAL` and unroutable without requalification; a missing or malformed digest on **either** side — including the case where **both** sides lack it — is `UNKNOWN` and fail-closed.
- Coordinated data amendments: `evals/fixtures/maws-vnext/qualification.contracts.json` (the two existing fingerprint cases gain the new required component; one new schema-decidable S7 negative case: a malformed instruction digest), `runtime/cli/specs/reference-audit-v1.json` (fingerprints + qualified snapshots), `evals/skill-effectiveness/negative-cases/cases.json` (the recorded transcript names the seven-key fingerprint set and asserts it).
- S7 test group in `tests/vnext/qualification.test.mjs` (7 tests): malformed/missing digest fail closed; the component digest IS the S6 `computeEffectiveInstructionDigest` value and is sensitivity-bound; stale-qualification block via `MATERIAL_FINGERPRINT_DRIFT`; model-switch regression; existing routing secured; a fingerprint pair that omits the digest on both sides is `UNKNOWN` and blocks reuse; a malformed digest on one side is `UNKNOWN`.
- Fingerprint helpers amended in `tests/vnext/e2e-reference-run.test.mjs`, `tests/vnext/failure-matrix.test.mjs`, `tests/vnext/harness-context.test.mjs` (the schema now requires the digest).

## Slice checkbox mapping

| Checkbox | Evidence |
| --- | --- |
| Effective Instruction Digest in Qualification-Konzept einordnen | fingerprint component + binding test against the S6 digest function |
| Materiality-Regeln erweitern | `TRACKED_COMPONENTS` + MATERIAL/UNKNOWN classification tests |
| Modellwechsel-Regressionen ergänzen | model_id delta ⇒ MATERIAL_FINGERPRINT_DRIFT ⇒ ineligible (regression test) |
| Stale Qualification zuverlässig blockieren | digest-only delta ⇒ exclusion `MATERIAL_FINGERPRINT_DRIFT` (eligibility test) |
| Bestehendes Executor-Routing unverändert absichern | equal-digest eligibility unchanged (no new exclusions); the full suite passes with no new exclusion on the unchanged path |

## Review round 1 — findings and repair

An independent review of the first S7 implementation (local audit agent, tool-driven with mutation probes; the codex connector was quota-exhausted for this slice) returned `PASS_WITH_FINDINGS` at 393/393. The mutation probes on the fingerprint key set, the tracked components, the materiality fail-closed path, the digest form of the real S6 producer and the CLI product path were all **bound**. The findings that were real are repaired here:

| Finding | Repair |
| --- | --- |
| P1 — the recorded disposition artifact violated the repository's own `registry-disposition.v1` contract (22 validator issues: unknown fields, missing required fields, empty `evidence_refs`, null `implementation_commit_sha`), and no gate caught it | The artifact is rewritten in the canonical grammar; the repository-wide gate `tests/vnext/registry-disposition-evidence.test.mjs` (merged in pull request 52) now fails any recorded disposition that does not satisfy the contract |
| P2 — materiality was not fail-closed when the instruction digest was missing on **both** sides: the deep-equal shortcut reported no delta, so `NON_MATERIAL` and a pre-S7 qualification could be inherited silently | The digest component is now special-cased: a missing or malformed digest on either side always yields an `UNKNOWN` delta, and `componentShapeOk` checks the canonical `sha256:` form for it. Two new tests cover both cases |
| P2 — the digest is spec-declared, never derived: the run spec carries the digest as data, and a change in the real instruction bundle does not by itself invalidate a qualification | The claim is narrowed to what is implemented — a required, tracked, spec-declared component — and the automatic bundle→fingerprint derivation at runtime is recorded below as an **OPEN obligation** rather than claimed as done |
| P3 — the run record stated 377/377 and a stale branch description | Corrected to the measured numbers and the current branch/base |
| P3 — the recorded skill-effectiveness transcript still named the six-key fingerprint set (the eval passed silently) | The transcript names the seven-key set and the case asserts it, so future key-set drift fails the case |
| P3 — the fixture diff was inflated by a whole-file re-indent | The fixture is back to the repository's compact formatting; only the semantic change remains (26 insertions / 2 deletions instead of 132 / 28) |
| P3 — the changelog had no S7 entry | Added |
| P3 — the pull request file list named 7 of 12 changed files | The complete list is in this record and in the pull request description |

## Verification

- `node --test tests/vnext/*.test.mjs` — **397/397 PASS** (388 at the S11 baseline, + 7 S7 tests, + 2 from the merged disposition gate).
- `npm run eval:maws-vnext` — ok:true (the fingerprint fixture incl. the new S7 negative case is catalog-registered).
- `npm run eval:skill-effectiveness` — exit 0, verdict IMPROVEMENT_PROVEN, security gate PASS.
- `npm run validate-maws-vnext` — issues: [].
- `npm run validate` — ok:true.
- `node scripts/tools/validate-registry-disposition.mjs evidence/qualification-integration-2026-10-20/registry-disposition.json` — passed: true.
- CLI product path: a run spec whose fingerprint omits the digest is rejected (`SPEC_FINGERPRINT_INVALID`); a spec whose current fingerprint digest differs from the qualified snapshot's digest is blocked with `NO_ELIGIBLE_EXECUTOR_FOR_STAGE`; an unchanged spec runs to completion.
- DoD: a material instruction change (digest delta) can no longer reuse an invalid qualification — proven at the materiality and the eligibility level, and now also fail-closed when the digest is absent on both sides.

## Scope boundary (what is NOT claimed)

- The digest is a **required, tracked, spec-declared** fingerprint component. The runtime does not yet derive it from the assembled instruction bundle: the run spec still carries the digest as spec-declared data, so a change in the real instruction bundle invalidates a qualification only when the declared digest is updated with it. The automatic bundle→fingerprint derivation at runtime is an **OPEN obligation** (recorded in this run record and in the disposition's `reason`), not a delivered capability of this slice.
- The qualification fingerprint remains the qualification concept's canonical binding surface; the engine consumes fingerprints as data (no engine change). Instruction-bundle assembly stays the S6 surface; S7 binds qualification to its digest output.
- The specification stays PROPOSED. The slice qualifies no model, grants no permission, activates no runtime and replaces no authority or approval decision.

## Open obligations (not closed by this run)

- **Registry registration: OPEN (REQUIRED_BUT_BLOCKED).** The run change registration and the `CONTRACT_RECORD` projections of `core/contracts/qualification-fingerprint.schema.json` and `core/contracts/materiality-decision.schema.json` are written after this branch merges, in `unitera-registry`; the local disposition stays `REQUIRED_BUT_BLOCKED` until that publication exists and the disposition is rebound to `UPDATED` with the registry commit sha.
- **Atlas representation: OPEN (REQUIRED_BUT_BLOCKED).** The Atlas claim for this slice is written after the Registry publication.
- **Runtime bundle→fingerprint derivation: OPEN.** The qualification fingerprint is not yet derived from the assembled instruction bundle at runtime (see the scope boundary above).
- **Independent review limitation.** The codex review connector was quota-exhausted for this slice; the independent review was performed by a local audit agent (a different model, tool-driven, with mutation probes). No human approval is claimed, and the slice is not presented as codex-reviewed.
