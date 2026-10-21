# RUN — Model-Adaptive Executor Profiles 2026-10-20 (SII implementation slice S12)

**Run ID:** model-adaptive-profiles-2026-10-20
**Date:** 2026-10-20 (S7-compliance repair recorded 2026-10-20, UTC instants in the mutation records below); the rebase onto `bfa56ec` and the full local re-verification were recorded 2026-10-21 (UTC)
**Source baseline:** `origin/main` = `bfa56ec17306ab709be3d492f02ac27150b4661a` (Merge PR #53, SII rebind) — the branch `s12/model-adaptive-profiles-20261020` was rebased onto it from its previous landing commit `1fcc29ed583348fecc00db1601e02392c47c4ef8`. The previous baseline was `27b17b62800d5d37e14bfe48ecd210603c4e1cb6` (Merge PR #47, S7 qualification integration), onto which the branch had been rebased from `45cd607cb29fb2574b8ee915256d2ec291f4db5d` (the original S12 slice commit). The slice was first published against `7fb6a5a2ad166cbac0ab43e3c1bb3dfdc1cdd255` (Merge PR #48, S13) after two further rebases onto `eb8d4232` (S11 registry-disposition shape) and `7fb6a5a2` (see the first publication of this record). The rebase onto `bfa56ec` brought in the S8 governance-promotion slice, the S4 skill-improvement-analyzer slice and the SII rebind; the rebase conflicts were confined to `CHANGELOG.md`, `evals/README.md` and `evals/catalog.json` and every conflict was resolved by keeping BOTH sides' entries, so no upstream content was dropped. The S7 merge changed one fact this slice depends on: `core/contracts/qualification-fingerprint.schema.json` now REQUIRES `effective_instruction_digest` inside `components` (required list: `model_id`, `provider_id`, `runtime_harness`, `tool_contract_refs`, `api_surface_version`, `qualification_profile_ref`, `effective_instruction_digest`; `additionalProperties: false`; digest pattern `^sha256:[a-f0-9]{64}$`).
**Spec basis:** `docs/proposals/skill-intelligence-target-spec.md` (`MAWS-SII-TARGET-SPEC-001` v0.2.0, PROPOSED), section 11.5 (model-adaptive executor profiles) and section 15, slice S12.
**Authority posture:** contract + deterministic runtime. A model-adaptive executor profile is a PRESENTATION and INTERACTION layer; it grants no authority (`authority_grant` is `none` by construction), changes no execution-profile dimension and confers no qualification (the qualification state is recorded, never conferred).

## 1. The Gap This Slice Closes

`Observed`: the spec's § 11.5 defined model-adaptive executor profiles — a versioned presentation layer over the unchanged, model-agnostic orchestration semantics — but MAWS had no contract, no runtime and no test for it. The only place the idea existed was prose. "Model-adaptive harness qualification" was therefore a *narrative* property: nothing in the repository could decide whether a profile presented for a given model/provider/harness was admissible, and nothing could refuse a profile that quietly widened the qualification it sat on top of.

## 2. Scope

1. New canonical contract `core/contracts/executor-model-profile.schema.json` (ExecutorModelProfile 1.0.0).
2. New runtime lane `runtime/harness-context/profiles/model-adaptive/`:
   * `profile-resolver.mjs` — the profile-level rules (R1–R8), the invariant-semantics assertion, the pinned-dimension comparison, the runtime-capability derivation, the instruction-digest decision and the qualification-coverage check.
   * `executor-profile.mjs` — the executor-profile computation: the single entry point that resolves the executor profile for a given (model, provider, harness, declared profile) and fails closed with the four typed S12 denial codes.
   * `profile-store.mjs` — the reading store (committed profiles, execution-profile reference pins, provider capability contract, derived provider exports, harness capability declarations).
   * `harness-capabilities.json` — the declared harness runtime capabilities (closed vocabulary).
   * `execution-profile-refs.json` — the reference-only pins of the execution profiles the committed profiles bind to.
   * `profiles/*.json` — six committed profiles (one per canonical provider, two for the same OpenAI-Codex model to make the DoD equivalence invariant provable on committed data).
3. Validator CLI `scripts/tools/validate-executor-model-profile.mjs` + npm script `validate-executor-model-profile`.
4. Fixture `evals/fixtures/maws-vnext/executor-model-profile.contracts.json` (19 schema cases + 7 runtime denial cases = 26 cases), registered in `evals/catalog.json`.
5. Tests `tests/vnext/executor-model-profile.test.mjs` (61 tests).
6. Amended `core/contracts/materiality-decision.schema.json` (component vocabulary gains `effective_instruction_digest`). After the rebase onto the S7 merge the enum carries `effective_instruction_digest` exactly ONCE — S7 and S12 carry the identical amendment, and the rebase left a single copy. The description sentence S12 adds is the only remaining difference against `origin/main`.
7. **S7 fingerprint-contract compliance (post-rebase repair, this pass).** The S7 merge made `effective_instruction_digest` a required component of the qualification fingerprint. The S12 slice had been written before that merge and built qualification fingerprints WITHOUT the component, so after the rebase the canonical fingerprint contract rejected every S12 fingerprint: `$.components: missing required property "effective_instruction_digest"`. The slice now complies — see § 2a.
8. **Registry-disposition CLI argument handling (this pass).** `scripts/tools/validate-registry-disposition.mjs` silently ignored a file named next to `--fixture` and answered with the fixture corpus instead, so `npm run validate-registry-disposition <file>` validated the corpus and not the artifact. The CLI now answers an explicitly named file with that artifact (`{"passed": true, "issues": []}`) while the argument-free npm script keeps validating the canonical corpus; a CLI case in `tests/vnext/registry-disposition-evidence.test.mjs` locks the behaviour. The validation logic itself is unchanged.
9. `core/contracts/README.md`, `evals/README.md`, `CHANGELOG.md`, this run record and the registry disposition.

**Out of scope (deliberately):** `core/contracts/execution-profile.schema.json` (unchanged by construction — the S12 layer only references it), `core/contracts/provider-capabilities.json` and the provider exports (read-only inputs), `evals/fixtures/maws-vnext-baseline.json` and `docs/authority-matrix.md` (the frozen design baseline — S11, S6 and S1 did not extend it either), and any representative-eval corpus for the model-adaptive profiles (see §9, open item 1).

**Changed by the S7 merge (not this slice's contract):** `core/contracts/qualification-fingerprint.schema.json`, `runtime/qualification/fingerprint.mjs`, `runtime/qualification/materiality.mjs`. The S12 lane READS the fingerprint contract (the validator validates every in-force fingerprint against it) and CONSUMES the fingerprint component; it does not amend the S7 contract, the S7 builder or the S7 materiality rules. The S12 runtime reuses the canonical S7 shape instead of hand-rolling a digest: the effective instruction digest is the one the S6 instruction-bundle assembler produces (`sha256:214d31e5…`, the digest the committed profiles already pin), and the fingerprint digest is the canonical `sha256Hex(canonicalJson(components))` of `runtime/qualification/fingerprint.mjs`.

## 2a. The S7 Fingerprint Contract Compliance

**`Observed` (the regression).** After the rebase onto the S7 merge, `npm run test:vnext` failed with two red tests and seven rejected fixture cases:

```
in_force fingerprint violates core/contracts/qualification-fingerprint.schema.json: $.components: missing required property "effective_instruction_digest"
```

Affected S12 artifacts: the seven `denial_cases` of `evals/fixtures/maws-vnext/executor-model-profile.contracts.json` (each carries an in-force qualification fingerprint), the inline fingerprints of `tests/vnext/executor-model-profile.test.mjs`, and the R5 requalification path of the runtime lane (S7's `classifyMateriality` classifies a fingerprint without the digest as `UNKNOWN`, so a non-material drift was blocked instead of routed).

**What changed.**

1. **Fixture records.** Every in-force qualification fingerprint in the seven `denial_cases` now carries the `effective_instruction_digest` component. The value is the digest the qualification was earned under — the same `sha256:214d31e57badd9a88b4305ebd7a71314ec3cfb259e4ef77280cdf09615a39dce` the committed profiles pin and the current effective instruction bundle produces (asserted by the test "the committed profile pin matches the repository's current effective instruction digest"). The fingerprint `digest` field was RECOMPUTED canonically as `sha256Hex(canonicalJson(components))` (`2af4acf9…` for the six `gpt-5-codex` fingerprints, `9e27d48b…` for the `gpt-5.1-codex` fingerprint) — the fixture digests were canonical before the repair and are canonical again after it. No placeholder digest is used anywhere.
2. **Committed profile JSONs.** `runtime/harness-context/profiles/model-adaptive/profiles/*.json` store no qualification fingerprint; they pin the effective instruction digest in `semantics_preservation.pinned_dimensions.effective_instruction_digest`. That pin already carried the canonical digest and is unchanged — the repair did not need to touch the six committed profiles.
3. **Runtime code path.** `runtime/harness-context/profiles/model-adaptive/profile-resolver.mjs` extends R8 from a two-value comparison to a THREE-value comparison: the digest the committed profile pins, the digest the qualification fingerprint carries (S7's required component) and the digest that is effective now must all be well-formed and identical. A fingerprint that carries no digest (a qualification earned before S7) or a digest that differs from the pinned one leaves the reuse UNPROVEN → `UNKNOWN` → the binding is refused with `MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT` and the canonical `MaterialityDecision` vocabulary. `executor-profile.mjs` passes the in-force fingerprint into that check. A changed effective digest stays `MATERIAL`.
4. **Test file.** The inline fingerprints of `tests/vnext/executor-model-profile.test.mjs` (`inForceState()` and the R5 `fingerprint()` helper) now carry the component and a canonical digest; the helper's `fingerprint_id` is now contract-shaped (`^fp_[a-z0-9_]+$`). Four new tests carry the compliance: the fingerprint must state the digest, a divergent digest leaves the reuse unproven, the in-force fingerprint satisfies the canonical S7 fingerprint contract (validated against `core/contracts/qualification-fingerprint.schema.json` in the test), and the executor-profile resolution refuses a fingerprint without the digest.

**What did NOT change (guards kept intact).** The six `semantics_preservation` `const "unchanged"` invariants; the `pinned_dimensions` block (including the required `effective_instruction_digest` pin); the closed `runtime_requirements` enum (`structured_output` / `tool_calls`); the six typed denial codes (`MODEL_PROFILE_SEMANTICS_WIDENED`, `MODEL_PROFILE_QUALIFICATION_UNCOVERED`, `MODEL_PROFILE_HARNESS_CAPABILITY_MISSING`, `MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT`, `MODEL_PROFILE_NOT_QUALIFIED`, `MODEL_PROFILE_BINDING_MISMATCH`); the closed `EXECUTOR_PROFILE_DENIAL_CODES` / `EXECUTOR_PROFILE_CODES` vocabularies; the `core/contracts/materiality-decision.schema.json` component enum (exactly one `effective_instruction_digest`); the S7 contract, builder and materiality rules (untouched by this slice).

## 3. Contract Shape And Why

| Field | Shape | Why |
|---|---|---|
| `profile_id` / `profile_version` | `emp_[a-z0-9_]+` / `x.y.z` | spec 11.5: "Profile sind versioniert". The version is part of the binding identity, so a profile switch is an explicit event and never an implicit overwrite. |
| `executor_id` / `provider_id` / `model_id` | bound identity | spec 11.5: the profile is bound to executor, provider and model. The runtime refuses a profile that binds a different pair than the requested one (`MODEL_PROFILE_BINDING_MISMATCH`). |
| `execution_profile_ref` | `profile_[a-z0-9_]+` (reference) | the separation to the execution profile: the model-adaptive profile *references* the qualification-side execution profile and never re-dimensions it. |
| `authority_grant` | `const "none"` | a presentation layer grants nothing. |
| `runtime_requirements` | closed enum `structured_output` / `tool_calls`, `minItems: 1`, `uniqueItems` | the runtime capabilities the model needs from the harness. The runtime re-derives this set from the presentation and refuses a mismatch, so an under-declaration cannot hide a missing harness capability. |
| `presentation` | the six optimizable dimensions, `additionalProperties: false` | spec 11.5's optimizable list: instruction density, example selection, output formatting, context packaging, tool-call interface requirements, retry strategy. Nothing else may be expressed here — in particular no execution-profile dimension. |
| `semantics_preservation` | six `const "unchanged"` + `pinned_dimensions` | the immutability assertion. The six invariant dimensions (task scope, authority ceiling, tool rights, security controls, completion criteria, evidence requirements) are `const "unchanged"`, so a widening is not expressible. `pinned_dimensions` pins the qualification-relevant state the execution profile in force pins (`tool_contract_refs`, `api_surface_version`, `qualification_profile_ref`) plus the `effective_instruction_digest` — all `required`, `additionalProperties: false`, closed digest form `^sha256:[a-f0-9]{64}$` (the form of `core/contracts/instruction-bundle.schema.json`). |
| `qualification` | `PROPOSED` / `QUALIFIED` / `EXPIRED`, `evidence_refs` | a profile is a qualification INPUT. `QUALIFIED` additionally requires `eval_profile_ref`, `qualified_at` and at least one evidence ref — a profile can never claim to be qualified without evidence. |
| `provenance` | `source_refs` (≥ 1) | the profile is reconstructable. |

### The "no silent widening" property, stated precisely

The property has two halves, and both are enforced:

1. **It cannot be expressed.** A profile that widens an invariant dimension is rejected by the schema (`const`), and a profile that omits the pinned dimensions is rejected by the schema (`required`). The contract exposes no writable execution-profile dimension at all: a recursive walk of the contract's property names contains none of `tools`, `effects`, `context`, `network`, `delegation`, `verification` (asserted by the test "the model-adaptive contract never introduces a writable execution-profile dimension").
2. **It cannot be kept.** The runtime compares the declared pins against the profile *actually in force* — the qualification fingerprint's `tool_contract_refs`, `api_surface_version` and `qualification_profile_ref`, plus the bound execution profile's id and its six dimensions — and refuses any difference with `MODEL_PROFILE_SEMANTICS_WIDENED`. A profile bound to a broader execution profile is therefore a widening even when the profile record itself is well-formed.

### The qualification fingerprint this slice sits on

`core/contracts/qualification-fingerprint.schema.json` (S7, canonical) is the shape of the qualification fingerprint the S12 lane consumes. Its `components` are a CLOSED set of seven keys: `model_id`, `provider_id`, `runtime_harness`, `tool_contract_refs`, `api_surface_version`, `qualification_profile_ref` and `effective_instruction_digest` (`^sha256:[a-f0-9]{64}$`). The S12 lane therefore (a) never constructs a fingerprint with a shape the contract forbids — the fixture and the test helpers build contract-valid fingerprints and the validator validates every in-force fingerprint against the canonical contract; (b) treats the `effective_instruction_digest` component as the statement of the instruction bundle the qualification was earned under, and refuses the binding when that statement is missing or unproven (R8, § 2a).

## 4. The Runtime Module And The Four Denial Paths

`runtime/harness-context/profiles/model-adaptive/executor-profile.mjs` computes the executor profile deterministically for a given (model, provider, harness, declared profile) against the state in force (qualification, qualification fingerprint, execution profile, current effective instruction digest). Every violation is a typed `FailClosedError`; there is no fallback, no default profile and no silent downgrade. The denial-code vocabulary is closed and exported (`EXECUTOR_PROFILE_DENIAL_CODES`, `EXECUTOR_PROFILE_CODES`).

| Code | Trigger |
|---|---|
| `MODEL_PROFILE_SEMANTICS_WIDENED` | the declared profile's semantics-preserving dimensions do not match the profile actually in force: a pinned dimension differs, a pin is missing, or the bound execution profile differs. |
| `MODEL_PROFILE_QUALIFICATION_UNCOVERED` | the model/provider pair is not covered by a qualification profile: no qualification record, a state other than `QUALIFIED`, a qualification without evidence, a fingerprint reference that does not match, or a fingerprint that names another model/provider pair. |
| `MODEL_PROFILE_HARNESS_CAPABILITY_MISSING` | the harness does not declare a runtime capability the model requires. A harness that is not declared declares nothing and is refused the same way — an undeclared capability is never assumed. |
| `MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT` | the effective instruction digest changed since qualification, or the qualification fingerprint does not state the digest it was earned under (S7 makes it a required fingerprint component). The drift is reported as a `MaterialityDecision` (canonical contract `core/contracts/materiality-decision.schema.json`, component `effective_instruction_digest`, class `MATERIAL` for a changed digest and `UNKNOWN` for an unproven one) — not with a parallel decision shape. |

Supporting codes: `MODEL_PROFILE_INPUT_INVALID`, `MODEL_PROFILE_NOT_FOUND`, `MODEL_PROFILE_BINDING_MISMATCH`, `MODEL_PROFILE_NOT_QUALIFIED`, `MODEL_PROFILE_RUNTIME_REQUIREMENTS_INCOHERENT`.

### Rules R1–R8 in `profile-resolver.mjs`

* **R1** one profile per (executor, provider, model, version); resolution is deterministic (newest version wins); an ambiguous binding is a finding, never a guess.
* **R2** the six invariant semantics dimensions are `unchanged`; the pinned qualification dimensions must be present and must equal the ones in force.
* **R3** two profiles of the same model produce equivalent authority and completion semantics (compared over the six execution-profile dimensions: `tools`/`effects`/`network`/`delegation` = authority, `context`/`verification` = completion). This is the slice DoD.
* **R4** a profile switch never widens authority.
* **R5** a model change or a material fingerprint drift requires requalification; the previous qualification is never inherited silently.
* **R6** the provider binding must be coherent with the canonical provider capability contract, and the derived provider exports must not disagree with it.
* **R7** the runtime capabilities the model requires must be declared by the harness, and the declaration must match the set the presentation implies.
* **R8** the effective instruction digest the profile was qualified under must still be effective, and the qualification fingerprint must state it: the pinned digest, the fingerprint's `effective_instruction_digest` component and the currently effective digest must all be well-formed and identical. A missing, malformed or divergent digest is `UNKNOWN` and blocks the binding; a changed effective digest is `MATERIAL` and blocks the binding.

## 5. Fixtures And Tests

* Fixture: `evals/fixtures/maws-vnext/executor-model-profile.contracts.json` — 19 schema cases (2 positive, 17 negative: widened invariant dimensions, missing/extra invariant dimension, missing pinned dimensions, missing instruction-digest pin, bad digest form, authority grant, missing/unknown presentation properties, bad profile version, qualified-without-evidence, missing/unknown runtime requirements, unpinned execution-profile ref, bad executor id, unknown schema version) plus 7 `denial_cases` (the happy path and one case per denial code plus the two supporting binding/qualification denials).
* The `denial_cases` carry synthetic `profile_overrides` applied to a committed profile and a contract-backed in-force block (the qualification record and the qualification fingerprint are validated against their canonical contracts inside the check, so the corpus is contract-backed, not free-form). Every in-force fingerprint carries the S7-required `effective_instruction_digest` component and a canonically computed fingerprint digest.
* Tests: `tests/vnext/executor-model-profile.test.mjs` — 61 tests covering the contract shape, the immutability assertion, the pinned-dimension comparison, the DoD equivalence invariant, the no-widening property, the requalification rule, the provider-coherence rules, the runtime-capability derivation, the instruction-digest drift, the S7 fingerprint-contract compliance, the qualification coverage, the four denial paths, determinism (same input → same output), and the validator surface.

## 6. Verification Performed

All commands below were run from the worktree root (worktree `/home/baum/workspace/baum-os/.worktrees/sessions/maws-s12-profiles-20261020`, branch `s12/model-adaptive-profiles-20261020`) on the rebased tree, whose base is `origin/main` = `bfa56ec17306ab709be3d492f02ac27150b4661a`. The totals in this table are the re-verified numbers of that tree; the earlier numbers from the `27b17b6` base appear only where the row names them as the pre-repair baseline.

| Command | Result |
|---|---|
| `npm run test:vnext` | **539 tests, 539 pass, 0 fail** (baseline of the same tree without `tests/vnext/executor-model-profile.test.mjs`: **478 tests, 478 pass, 0 fail**; the S12 file contributes 61). Baseline before the S7-compliance repair on this branch: **483 tests, 481 pass, 2 fail** (the S12 file then had 57 tests; it has 61 now) — the two failures were `R5 a non-material drift keeps the profile routable …` (UNKNOWN instead of NON_MATERIAL, because S7's `classifyMateriality` treats a fingerprint without the instruction digest as UNKNOWN) and `validator surface: the committed profiles, provider coverage, DoD pairs and fixture are green` (the seven rejected fixture fingerprints). |
| `npm run validate-executor-model-profile` | PASS — `executor-model-profile fixture: 19 cases checked, 0 unexpected results` / `executor-model-profile denial cases: 7 checked, 0 unexpected results` / `executor-model-profile store: 6 profiles checked, 0 issues` |
| `npm run validate-maws-vnext` | PASS (`"ok": true`, contract fixtures 20 / cases 215, no issues) |
| `npm run eval:maws-vnext` | PASS — `"ok": true`, total 19, passed 19, failed 0, blockingFailures 0; the `maws-vnext-executor-model-profile-contracts` fixture is registered and green |
| `npm run validate` | PASS (`"ok": true`, `issueCount: 0`) |
| `npm run validate-neutral` | PASS (`"ok": true`, `issueCount: 0`) |
| `npm run test:skill-frontdoor` | PASS — **6 tests, 6 pass, 0 fail** |
| `node scripts/tools/ci-gate.mjs` | PASS — `PASS CI Gate` (exit 0) |
| `node scripts/tools/validate-registry-disposition.mjs evidence/model-adaptive-profiles-2026-10-20/registry-disposition.json` | PASS (`{"passed": true, "issues": []}`) — the node command is run directly on purpose: the npm wrapper `validate-registry-disposition` hard-wires `--fixture evals/fixtures/registry-disposition-contract.json`, so a file argument appended to it is shadowed by the corpus. |
| `node --check` on the changed `.mjs` files | PASS |
| hosted GitHub Actions (`loop-repo-ci`) | **NOT RUN** — the account is locked for a billing issue, so no hosted job started for this branch. Every step of the workflow was replicated locally on the rebased tree (the table above) and passes; the absence of a hosted CI run is disclosed here rather than presented as a green gate. |

## 7. Mutation Evidence (guards proven to bite)

Each mutation was applied with the Edit tool, the failure was observed, and the guard was restored afterwards. The restored state was re-verified after every mutation: `tests/vnext/executor-model-profile.test.mjs` 61/61 green and the validator reporting 0 unexpected results. The final tree contains no mutation marker (a case-insensitive scan for the marker token over the whole tree, excluding `node_modules/` and `.git/`, returns no hits).

**M1 — no silent widening: the pinned-dimension comparison is disabled** (`profile-resolver.mjs`, `assertPinnedDimensionsMatch` → `const mismatches = {}`):

```
✖ the executor profile resolution denies with the typed code of the violated rule
  AssertionError [ERR_ASSERTION]: expected FailClosedError MODEL_PROFILE_SEMANTICS_WIDENED, but nothing was thrown
✖ validator surface: the committed profiles, provider coverage, DoD pairs and fixture are green
  + 'executor-model-profile-denial-semantics-widened: expected the denial MODEL_PROFILE_SEMANTICS_WIDENED but the executor profile was resolved for emp_openai_codex_gpt5_codex@1.0.0'
ℹ tests 61
ℹ pass 59
ℹ fail 2
```

```
executor-model-profile denial cases: 7 checked, 1 unexpected results
executor-model-profile store: 6 profiles checked, 1 issues
executor-model-profile-denial-semantics-widened: expected the denial MODEL_PROFILE_SEMANTICS_WIDENED but the executor profile was resolved for emp_openai_codex_gpt5_codex@1.0.0
```

**M2 — the model/provider coverage comparison is disabled** (`profile-resolver.mjs`, `assertQualificationCoverage` → `if (false)`):

```
✖ a qualification for another model does not cover the requested pair
✖ the executor profile resolution denies with the typed code of the violated rule
✖ validator surface: the committed profiles, provider coverage, DoD pairs and fixture are green
ℹ tests 61
ℹ pass 58
ℹ fail 3
```

```
executor-model-profile denial cases: 7 checked, 1 unexpected results
executor-model-profile store: 6 profiles checked, 1 issues
executor-model-profile-denial-qualification-uncovered: expected the denial MODEL_PROFILE_QUALIFICATION_UNCOVERED but the executor profile was resolved for emp_openai_codex_gpt5_codex@1.0.0
```

**M3 — the harness capability check is disabled** (`profile-resolver.mjs`, `harnessCapabilityIssues` → `if (false)`):

```
✖ R7 a harness that does not declare the required capability fails closed
✖ the executor profile resolution denies with the typed code of the violated rule
✖ the non-throwing diagnostic view reports the same denial code as the enforcement path
✖ validator surface: the committed profiles, provider coverage, DoD pairs and fixture are green
ℹ tests 61
ℹ pass 57
ℹ fail 4
```

```
executor-model-profile denial cases: 7 checked, 1 unexpected results
executor-model-profile store: 6 profiles checked, 1 issues
executor-model-profile-denial-harness-capability-missing: expected the denial MODEL_PROFILE_HARNESS_CAPABILITY_MISSING but the executor profile was resolved for emp_openai_codex_gpt5_codex@1.0.0
```

**M4 — the instruction-digest drift classification is disabled** (`profile-resolver.mjs`, `instructionDigestDecision` → the classification is always `NON_MATERIAL`):

```
✖ R8 a changed effective instruction digest blocks the profile with the canonical materiality vocabulary
✖ R8 an unknown instruction digest is UNKNOWN, never assumed to be unchanged
✖ S7 the qualification fingerprint must state the effective instruction digest it was earned under
✖ S7 a fingerprint whose digest differs from the pinned digest leaves the reuse unproven
✖ S7 the executor profile resolution refuses a fingerprint without the instruction digest
✖ the executor profile resolution denies with the typed code of the violated rule
✖ validator surface: the committed profiles, provider coverage, DoD pairs and fixture are green
ℹ tests 61
ℹ pass 54
ℹ fail 7
```

```
executor-model-profile denial cases: 7 checked, 1 unexpected results
executor-model-profile store: 6 profiles checked, 1 issues
executor-model-profile-denial-instruction-digest-drift: expected the denial MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT but the executor profile was resolved for emp_openai_codex_gpt5_codex@1.0.0
```

**M5 — the contract-level invariant is weakened** (`core/contracts/executor-model-profile.schema.json`, `authority_ceiling` `const "unchanged"` → `enum ["unchanged", "widened"]`):

```
✖ the invariant semantics block is structurally impossible to widen (all six dimensions are const "unchanged")
  AssertionError [ERR_ASSERTION]: authority_ceiling must be const "unchanged"
✖ validator surface: the committed profiles, provider coverage, DoD pairs and fixture are green
  + 'fixture case executor-model-profile-rejects-widened-authority-ceiling: expected failure but observed pass: (no issues)'
✖ the committed fixture stays schema-decidable and keeps its positive/negative labels
ℹ tests 61
ℹ pass 58
ℹ fail 3
```

```
executor-model-profile fixture: 19 cases checked, 1 unexpected results
fixture case executor-model-profile-rejects-widened-authority-ceiling: expected failure but observed pass: (no issues)
```

**M6 — the pinned-dimensions requirement is removed** (`core/contracts/executor-model-profile.schema.json`, `semantics_preservation.required` drops `pinned_dimensions`):

```
✖ the semantics_preservation block pins the qualification-relevant dimensions of the execution profile in force
✖ validator surface: the committed profiles, provider coverage, DoD pairs and fixture are green
  + 'fixture case executor-model-profile-rejects-missing-pinned-dimensions: expected failure but observed pass: (no issues)'
✖ the committed fixture stays schema-decidable and keeps its positive/negative labels
ℹ tests 61
ℹ pass 58
ℹ fail 3
```

```
executor-model-profile fixture: 19 cases checked, 1 unexpected results
fixture case executor-model-profile-rejects-missing-pinned-dimensions: expected failure but observed pass: (no issues)
```

**M7 — the S7 fingerprint-digest requirement is disabled** (`profile-resolver.mjs`, `instructionDigestDecision` → the qualified-fingerprint branch is skipped):

```
✖ S7 the qualification fingerprint must state the effective instruction digest it was earned under
✖ S7 a fingerprint whose digest differs from the pinned digest leaves the reuse unproven
✖ S7 the executor profile resolution refuses a fingerprint without the instruction digest
ℹ tests 61
ℹ pass 58
ℹ fail 3
```

```
executor-model-profile fixture: 19 cases checked, 0 unexpected results
executor-model-profile denial cases: 7 checked, 0 unexpected results
executor-model-profile store: 6 profiles checked, 0 issues
```

The committed fixture corpus is unaffected by M7 (every committed in-force fingerprint carries the digest — that is the compliance state), so the guard is proven by the three S7 tests: they turn red the moment the requirement is removed.

### What the seven mutations cover

| Required property | Mutation that proves it bites |
|---|---|
| no silent widening (runtime) | M1 |
| the (model, provider) pair is covered by a qualification profile | M2 |
| the harness declares the runtime capability the model requires | M3 |
| the effective instruction digest changed since qualification | M4 |
| a widened invariant dimension cannot even be expressed | M5 |
| the pinned qualification dimensions cannot be omitted | M6 |
| the qualification fingerprint must state the effective instruction digest it was earned under (S7) | M7 |

## 8. Results, Open Items And Known Overlaps

* Model-adaptive harness qualification is now structural: a contract decides what a profile may express, a deterministic runtime decides whether it may be bound, and a closed set of typed denial codes makes every refusal machine-readable. The slice DoD — "two profiles of the same model deliver equivalent authority and completion semantics at different presentation, and a profile switch creates no extended permissions" — is provable on committed data (`emp_openai_codex_gpt5_codex` 1.0.0 vs 1.1.0) and is asserted by the validator on every run.
* The slice complies with the merged S7 qualification-fingerprint contract: every fingerprint it constructs, stores or validates carries the required `effective_instruction_digest` component with a canonically computed fingerprint digest, and the runtime refuses a binding whose qualification fingerprint does not state that digest.
* Registry consequence: two canonical contracts are affected by the slice — the new `core/contracts/executor-model-profile.schema.json` and the amended `core/contracts/materiality-decision.schema.json` — which is a `CONTRACT_RECORD` class change under this repository's adopted relevance classes. The S7 fingerprint contract is NOT amended by this slice (it is read, not written). The Registry write is its own registered change and is not performed by this slice, so the disposition is `REQUIRED_BUT_BLOCKED` with `registry_commit_sha: null`. See `registry-disposition.json`.
* **Known overlap (now resolved by the merge, disclosed here):** the one-line component-vocabulary amendment of `core/contracts/materiality-decision.schema.json` was carried identically by the S7 branch and by this slice; it has been merged as PR #47 (`27b17b6`) and the rebase left exactly ONE `effective_instruction_digest` in the enum — the two amendments describe the same vocabulary and are de-duplicated. This slice does not re-implement S7's fingerprint wiring (`core/contracts/qualification-fingerprint.schema.json`, `runtime/qualification/fingerprint.mjs`, `runtime/qualification/materiality.mjs` are untouched by this slice); it READS the merged contract and CONSUMES its component.
* Open items:
  1. **Representative-eval qualification is not recorded.** All six committed profiles stay `qualification.state: PROPOSED`; no representative-eval corpus for model-adaptive profiles exists in this repository yet. The runtime refuses to bind a non-QUALIFIED profile, so the committed profiles are deliberately not bindable today. This is stated, not papered over: the DoD bullet "Qualification gegen repräsentative Evals" is not closed by this slice.
  2. The Unitera-registry `CONTRACT_RECORD` write for the two contracts, then the rebind of this disposition to `UPDATED` with the registry `registry_commit_sha` (own gated change, two-phase pattern as in S1/S4/S6).
  3. The `implementation_commit_sha` of the disposition is bound to the landing commit of the S7-compliance repair — after the rebase that is `186240aa154df7f41c63210566edc7109f159ed3` (the rebased `70d21a3`); the registry commit sha stays `null` until the Registry write exists, so the disposition stays `REQUIRED_BUT_BLOCKED`.
* Baseline drift: `origin/main` advanced twice during the run — from `7fb6a5a2` to `27b17b6` (Merge PR #47, S7 qualification integration, which merged the qualification-fingerprint contract with the required `effective_instruction_digest` component) and then on to `bfa56ec` (Merge PR #53, which carries the S8 governance-promotion slice, the S4 skill-improvement-analyzer slice and the SII rebind). The branch was rebased onto `27b17b6` before the S7-compliance repair and onto `bfa56ec` after it. Both rebase rounds had their conflicts confined to `CHANGELOG.md`, `evals/README.md` and `evals/catalog.json`, and every conflict was resolved by keeping BOTH sides' entries (the upstream entry and the S12 entry), so no upstream content was dropped. The slice's diff against the new base lists exactly the S12 slice files plus the five shared documentation/config files (`CHANGELOG.md`, `core/contracts/README.md`, `evals/README.md`, `evals/catalog.json`, `package.json`); no file of any other slice appears in it.
