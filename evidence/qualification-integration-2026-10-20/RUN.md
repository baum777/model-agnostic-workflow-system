# S7 Run Record — Qualification Integration (2026-10-20)

- Spec binding: `MAWS-SII-TARGET-SPEC-001` v0.2.0 (PROPOSED), slice S7 + sections 11.2/11.3.
- Source of authority: bounded owner run directive of 2026-10-20 ("run S11 implementierung und closure S7, S13 und S8"). Materialization only; the specification stays PROPOSED, no runtime authority is granted.
- Branch: `s7/qualification-integration-20261020`, stacked on the S11 branch (`s11/harness-context-20261020` @ `980e3f9`); rebase onto main after the S11 merge.

## What was implemented

- `core/contracts/qualification-fingerprint.schema.json` — components gain required `effective_instruction_digest` (`sha256:`-prefixed 64-hex, the instruction-bundle digest form of S6). A qualification is bound to the exact effective instruction set it was earned under.
- `runtime/qualification/fingerprint.mjs` — `FINGERPRINT_COMPONENT_KEYS` (closed set, fail closed on unexpected keys) gains `effective_instruction_digest`; value validation `^sha256:[a-f0-9]{64}$`; component may not be null.
- `runtime/qualification/materiality.mjs` — `TRACKED_COMPONENTS` gains the digest: any digest delta is `MATERIAL` and unroutable without requalification; missing/malformed shape on either side stays `UNKNOWN` (fail closed).
- Coordinated data amendments: `evals/fixtures/maws-vnext/qualification.contracts.json` (+1 schema-decidable negative case: malformed digest), `runtime/cli/specs/reference-audit-v1.json` (fingerprints + qualified snapshots), fingerprint helpers in `tests/vnext/{e2e-reference-run,failure-matrix,harness-context,qualification}.test.mjs`.
- S7 test group in `tests/vnext/qualification.test.mjs` (5 tests): malformed/missing digest fail closed; the component digest IS the S6 `computeEffectiveInstructionDigest` value and is sensitivity-bound (one added selected source ⇒ different digest ⇒ MATERIAL); stale-qualification block via `MATERIAL_FINGERPRINT_DRIFT` in `computeEligibility`; model-switch regression (§11.4: a stronger model version never silently reuses the qualification); existing routing secured (identical instruction state stays eligible with an unchanged exclusion surface).

## Slice checkbox mapping

| Checkbox | Evidence |
| --- | --- |
| Effective Instruction Digest in Qualification-Konzept einordnen | fingerprint component + binding test against the S6 digest function |
| Materiality-Regeln erweitern | `TRACKED_COMPONENTS` + MATERIAL/UNKNOWN classification tests |
| Modellwechsel-Regressionen ergänzen | model_id delta ⇒ MATERIAL_FINGERPRINT_DRIFT ⇒ ineligible (regression test) |
| Stale Qualification zuverlässig blockieren | digest-only delta ⇒ exclusion `MATERIAL_FINGERPRINT_DRIFT` (eligibility test) |
| Bestehendes Executor-Routing unverändert absichern | equal-digest eligibility unchanged (no new exclusions); all 377 tests pass |

## Verification

- `node --test tests/vnext/*.test.mjs` — 377/377 PASS (372 S11 baseline + 5 S7).
- `npm run eval:maws-vnext` — ok:true (new fingerprint negative case included).
- DoD: materielle Instruktionsänderungen (digest delta) können keine ungültige Qualification wiederverwenden — proven at materiality and eligibility level.

## Boundary

- The qualification fingerprint remains the qualification concept's canonical binding surface; the engine consumes fingerprints as data (no engine change). Instruction-bundle assembly stays the S6 surface; S7 binds qualification to its digest output.
- Spec remains PROPOSED.
