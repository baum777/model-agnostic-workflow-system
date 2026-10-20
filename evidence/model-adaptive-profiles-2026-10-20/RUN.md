# RUN — Model-Adaptive Executor Profiles 2026-10-20 (SII implementation slice S12)

**Run ID:** model-adaptive-profiles-2026-10-20
**Date:** 2026-10-20
**Source baseline:** `origin/main` = `7fb6a5a2ad166cbac0ab43e3c1bb3dfdc1cdd255` (Merge PR #48, S13 comparative benchmark harness) at publication time. The worktree was created detached from `2cd0edcc2f538d1aa9ad1a810dd828515eac0a98` (Merge PR #46) and the branch `s12/model-adaptive-profiles-20261020` was created on it; `origin/main` advanced twice while the slice was in flight (`eb8d4232`, the canonical registry-disposition shape for S11, and `7fb6a5a2`, the S13 merge), and the branch was rebased onto both before publication (see §8).
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
5. Tests `tests/vnext/executor-model-profile.test.mjs` (57 tests).
6. Amended `core/contracts/materiality-decision.schema.json` (component vocabulary gains `effective_instruction_digest`).
7. `core/contracts/README.md`, `evals/README.md`, `CHANGELOG.md`, this run record and the registry disposition.

**Out of scope (deliberately):** `core/contracts/execution-profile.schema.json` (unchanged by construction — the S12 layer only references it), `core/contracts/qualification-fingerprint.schema.json` and `runtime/qualification/*` (the fingerprint wiring of the instruction digest is slice S7's coordinated amendment, not this slice's), `core/contracts/provider-capabilities.json` and the provider exports (read-only inputs), `evals/fixtures/maws-vnext-baseline.json` and `docs/authority-matrix.md` (the frozen design baseline — S11, S6 and S1 did not extend it either), and any representative-eval corpus for the model-adaptive profiles (see §9, open item 1).

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

## 4. The Runtime Module And The Four Denial Paths

`runtime/harness-context/profiles/model-adaptive/executor-profile.mjs` computes the executor profile deterministically for a given (model, provider, harness, declared profile) against the state in force (qualification, qualification fingerprint, execution profile, current effective instruction digest). Every violation is a typed `FailClosedError`; there is no fallback, no default profile and no silent downgrade. The denial-code vocabulary is closed and exported (`EXECUTOR_PROFILE_DENIAL_CODES`, `EXECUTOR_PROFILE_CODES`).

| Code | Trigger |
|---|---|
| `MODEL_PROFILE_SEMANTICS_WIDENED` | the declared profile's semantics-preserving dimensions do not match the profile actually in force: a pinned dimension differs, a pin is missing, or the bound execution profile differs. |
| `MODEL_PROFILE_QUALIFICATION_UNCOVERED` | the model/provider pair is not covered by a qualification profile: no qualification record, a state other than `QUALIFIED`, a qualification without evidence, a fingerprint reference that does not match, or a fingerprint that names another model/provider pair. |
| `MODEL_PROFILE_HARNESS_CAPABILITY_MISSING` | the harness does not declare a runtime capability the model requires. A harness that is not declared declares nothing and is refused the same way — an undeclared capability is never assumed. |
| `MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT` | the effective instruction digest changed since qualification. The drift is reported as a `MaterialityDecision` (canonical contract `core/contracts/materiality-decision.schema.json`, component `effective_instruction_digest`, class `MATERIAL` for a changed digest and `UNKNOWN` for an unproven one) — not with a parallel decision shape. |

Supporting codes: `MODEL_PROFILE_INPUT_INVALID`, `MODEL_PROFILE_NOT_FOUND`, `MODEL_PROFILE_BINDING_MISMATCH`, `MODEL_PROFILE_NOT_QUALIFIED`, `MODEL_PROFILE_RUNTIME_REQUIREMENTS_INCOHERENT`.

### Rules R1–R8 in `profile-resolver.mjs`

* **R1** one profile per (executor, provider, model, version); resolution is deterministic (newest version wins); an ambiguous binding is a finding, never a guess.
* **R2** the six invariant semantics dimensions are `unchanged`; the pinned qualification dimensions must be present and must equal the ones in force.
* **R3** two profiles of the same model produce equivalent authority and completion semantics (compared over the six execution-profile dimensions: `tools`/`effects`/`network`/`delegation` = authority, `context`/`verification` = completion). This is the slice DoD.
* **R4** a profile switch never widens authority.
* **R5** a model change or a material fingerprint drift requires requalification; the previous qualification is never inherited silently.
* **R6** the provider binding must be coherent with the canonical provider capability contract, and the derived provider exports must not disagree with it.
* **R7** the runtime capabilities the model requires must be declared by the harness, and the declaration must match the set the presentation implies.
* **R8** the effective instruction digest the profile was qualified under must still be effective.

## 5. Fixtures And Tests

* Fixture: `evals/fixtures/maws-vnext/executor-model-profile.contracts.json` — 19 schema cases (2 positive, 17 negative: widened invariant dimensions, missing/extra invariant dimension, missing pinned dimensions, missing instruction-digest pin, bad digest form, authority grant, missing/unknown presentation properties, bad profile version, qualified-without-evidence, missing/unknown runtime requirements, unpinned execution-profile ref, bad executor id, unknown schema version) plus 7 `denial_cases` (the happy path and one case per denial code plus the two supporting binding/qualification denials).
* The `denial_cases` carry synthetic `profile_overrides` applied to a committed profile and a contract-backed in-force block (the qualification record and the qualification fingerprint are validated against their canonical contracts inside the check, so the corpus is contract-backed, not free-form).
* Tests: `tests/vnext/executor-model-profile.test.mjs` — 57 tests covering the contract shape, the immutability assertion, the pinned-dimension comparison, the DoD equivalence invariant, the no-widening property, the requalification rule, the provider-coherence rules, the runtime-capability derivation, the instruction-digest drift, the qualification coverage, the four denial paths, determinism (same input → same output), and the validator surface.

## 6. Verification Performed

All commands were run from the worktree root.

| Command | Result |
|---|---|
| `npm run test:vnext` | **476 tests, 476 pass, 0 fail** (baseline before the change on `origin/main` @ `7fb6a5a2`: **419 tests, 419 pass, 0 fail**; +57 from `tests/vnext/executor-model-profile.test.mjs`) |
| `npm run validate-executor-model-profile` | PASS — `executor-model-profile fixture: 19 cases checked, 0 unexpected results` / `executor-model-profile denial cases: 7 checked, 0 unexpected results` / `executor-model-profile store: 6 profiles checked, 0 issues` |
| `npm run validate-maws-vnext` | PASS (`"ok": true`, no issues) |
| `npm run eval:maws-vnext` | PASS — the new `maws-vnext-executor-model-profile-contracts` fixture is registered and green |
| `npm run validate` | PASS (`issueCount: 0`) |
| `npm run validate-neutral` | PASS (`issueCount: 0`) |
| `npm run validate-secrets` | PASS (`issueCount: 0`) |
| `npm run scan-secrets` | PASS (`findingCount: 0`) |
| `node scripts/tools/ci-gate.mjs` | PASS CI Gate |
| `node --check` on the four new/changed `.mjs` files | PASS |

## 7. Mutation Evidence (guards proven to bite)

Each mutation was applied with the Edit tool, the failure was observed, and the guard was restored afterwards. The restored state was re-verified after every mutation: `tests/vnext/executor-model-profile.test.mjs` 57/57 green and the validator reporting 0 unexpected results. The final tree contains no mutation marker (`grep -rn "MUTATION" runtime/ core/ scripts/ tests/` → no hits).

**M1 — no silent widening: the pinned-dimension comparison is disabled** (`profile-resolver.mjs`, `assertPinnedDimensionsMatch` → `const mismatches = {}`):

```
✖ the executor profile resolution denies with the typed code of the violated rule (1.603029ms)
  AssertionError [ERR_ASSERTION]: expected FailClosedError MODEL_PROFILE_SEMANTICS_WIDENED, but nothing was thrown
✖ validator surface: the committed profiles, provider coverage, DoD pairs and fixture are green (40.613517ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + [
  +   'executor-model-profile-denial-semantics-widened: expected the denial MODEL_PROFILE_SEMANTICS_WIDENED but the executor profile was resolved for emp_openai_codex_gpt5_codex@1.0.0'
  + ]
  - []
ℹ tests 57
ℹ pass 55
ℹ fail 2
```

```
executor-model-profile denial cases: 7 checked, 1 unexpected results
executor-model-profile store: 6 profiles checked, 1 issues
executor-model-profile-denial-semantics-widened: expected the denial MODEL_PROFILE_SEMANTICS_WIDENED but the executor profile was resolved for emp_openai_codex_gpt5_codex@1.0.0
```

**M2 — the model/provider coverage comparison is disabled** (`profile-resolver.mjs`, `assertQualificationCoverage` → `if (false)`):

```
✖ a qualification for another model does not cover the requested pair (0.930963ms)
  AssertionError [ERR_ASSERTION]: expected FailClosedError MODEL_PROFILE_QUALIFICATION_UNCOVERED, but nothing was thrown
ℹ tests 57
ℹ pass 54
ℹ fail 3
```

```
executor-model-profile-denial-qualification-uncovered: expected the denial MODEL_PROFILE_QUALIFICATION_UNCOVERED but the executor profile was resolved for emp_openai_codex_gpt5_codex@1.0.0
```

**M3 — the harness capability check is disabled** (`profile-resolver.mjs`, `harnessCapabilityIssues` → `if (false)`):

```
✖ R7 a harness that does not declare the required capability fails closed (10.550082ms)
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
    assert.ok(issues.length >= 1)
ℹ tests 57
ℹ pass 53
ℹ fail 4
```

```
executor-model-profile-denial-harness-capability-missing: expected the denial MODEL_PROFILE_HARNESS_CAPABILITY_MISSING but the executor profile was resolved for emp_openai_codex_gpt5_codex@1.0.0
```

**M4 — the instruction-digest drift classification is disabled** (`profile-resolver.mjs`, `instructionDigestDecision` → always `NON_MATERIAL`):

```
✖ R8 a changed effective instruction digest blocks the profile with the canonical materiality vocabulary (0.839394ms)
  AssertionError [ERR_ASSERTION]: expected FailClosedError MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT, but nothing was thrown
✖ R8 an unknown instruction digest is UNKNOWN, never assumed to be unchanged (0.263553ms)
  AssertionError [ERR_ASSERTION]: expected FailClosedError MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT, but nothing was thrown
✖ the executor profile resolution denies with the typed code of the violated rule (0.837681ms)
  AssertionError [ERR_ASSERTION]: expected FailClosedError MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT, but nothing was thrown
✖ validator surface: the committed profiles, provider coverage, DoD pairs and fixture are green (45.355071ms)
ℹ tests 57
ℹ pass 53
ℹ fail 4
```

```
executor-model-profile-denial-instruction-digest-drift: expected the denial MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT but the executor profile was resolved for emp_openai_codex_gpt5_codex@1.0.0
```

**M5 — the contract-level invariant is weakened** (`core/contracts/executor-model-profile.schema.json`, `authority_ceiling` `const "unchanged"` → `enum ["unchanged", "widened"]`):

```
✖ the invariant semantics block is structurally impossible to widen (all six dimensions are const "unchanged") (1.583003ms)
  AssertionError [ERR_ASSERTION]: authority_ceiling must be const "unchanged"
  + actual - expected
  + undefined
  - 'unchanged'
✖ validator surface: the committed profiles, provider coverage, DoD pairs and fixture are green (36.83989ms)
  + [
  +   'fixture case executor-model-profile-rejects-widened-authority-ceiling: expected failure but observed pass: (no issues)'
  + ]
✖ the committed fixture stays schema-decidable and keeps its positive/negative labels (1.302113ms)
  AssertionError [ERR_ASSERTION]: executor-model-profile-rejects-widened-authority-ceiling must be schema-invalid
ℹ tests 57
ℹ pass 54
ℹ fail 3
```

```
executor-model-profile fixture: 19 cases checked, 1 unexpected results
fixture case executor-model-profile-rejects-widened-authority-ceiling: expected failure but observed pass: (no issues)
```

**M6 — the pinned-dimensions requirement is removed** (`core/contracts/executor-model-profile.schema.json`, `semantics_preservation.required` drops `pinned_dimensions`):

```
✖ the semantics_preservation block pins the qualification-relevant dimensions of the execution profile in force (11.368561ms)
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
✖ validator surface: the committed profiles, provider coverage, DoD pairs and fixture are green (42.871591ms)
  + [
  +   'fixture case executor-model-profile-rejects-missing-pinned-dimensions: expected failure but observed pass: (no issues)'
  + ]
✖ the committed fixture stays schema-decidable and keeps its positive/negative labels (4.735756ms)
  AssertionError [ERR_ASSERTION]: executor-model-profile-rejects-missing-pinned-dimensions must be schema-invalid
ℹ tests 57
ℹ pass 54
ℹ fail 3
```

```
executor-model-profile fixture: 19 cases checked, 1 unexpected results
fixture case executor-model-profile-rejects-missing-pinned-dimensions: expected failure but observed pass: (no issues)
```

### What the six mutations cover

| Required property | Mutation that proves it bites |
|---|---|
| no silent widening (runtime) | M1 |
| the (model, provider) pair is covered by a qualification profile | M2 |
| the harness declares the runtime capability the model requires | M3 |
| the effective instruction digest changed since qualification | M4 |
| a widened invariant dimension cannot even be expressed | M5 |
| the pinned qualification dimensions cannot be omitted | M6 |

## 8. Results, Open Items And Known Overlaps

* Model-adaptive harness qualification is now structural: a contract decides what a profile may express, a deterministic runtime decides whether it may be bound, and a closed set of typed denial codes makes every refusal machine-readable. The slice DoD — "two profiles of the same model deliver equivalent authority and completion semantics at different presentation, and a profile switch creates no extended permissions" — is provable on committed data (`emp_openai_codex_gpt5_codex` 1.0.0 vs 1.1.0) and is asserted by the validator on every run.
* Registry consequence: two canonical contracts are affected — the new `core/contracts/executor-model-profile.schema.json` and the amended `core/contracts/materiality-decision.schema.json` — which is a `CONTRACT_RECORD` class change under this repository's adopted relevance classes. The Registry write is its own registered change and is not performed by this slice, so the disposition is `REQUIRED_BUT_BLOCKED` with `registry_commit_sha: null`. See `registry-disposition.json`.
* **Known overlap (disclosed, not resolved here):** the one-line component-vocabulary amendment of `core/contracts/materiality-decision.schema.json` is the same amendment the open S7 branch `origin/s7/qualification-integration-20261020b` (commit `5897aad`, "fix(qualification): declare the instruction digest in the materiality component enum") already carries. This slice needed it to report the instruction-digest drift with the canonical decision contract instead of a parallel shape, and it did NOT re-implement S7's fingerprint wiring (`core/contracts/qualification-fingerprint.schema.json`, `runtime/qualification/fingerprint.mjs`, `runtime/qualification/materiality.mjs` are untouched by this slice). When S7 lands, the two identical amendments describe the same vocabulary and must be de-duplicated by the owner. The S12 lane reads the current effective instruction digest from the S6 instruction-bundle lane instead of from the fingerprint, so it does not depend on S7 being merged first.
* Open items:
  1. **Representative-eval qualification is not recorded.** All six committed profiles stay `qualification.state: PROPOSED`; no representative-eval corpus for model-adaptive profiles exists in this repository yet. The runtime refuses to bind a non-QUALIFIED profile, so the committed profiles are deliberately not bindable today. This is stated, not papered over: the DoD bullet "Qualification gegen repräsentative Evals" is not closed by this slice.
  2. The Unitera-registry `CONTRACT_RECORD` write for the two contracts, then the rebind of this disposition to `UPDATED` with the registry `registry_commit_sha` (own gated change, two-phase pattern as in S1/S4/S6).
  3. `implementation_commit_sha` in the disposition is a placeholder: the change is published as a branch commit and must be bound to the landing commit.
* Baseline drift: `origin/main` advanced twice during the run — from `2cd0edc` to `eb8d423` (the S11 registry-disposition shape repair, which also added the CI-enforced `tests/vnext/registry-disposition-evidence.test.mjs` gate) and then to `7fb6a5a` (the S13 comparative-benchmark merge). The branch was rebased onto both commits before publication; the conflicts were confined to `CHANGELOG.md`, `evals/README.md` and `evals/catalog.json` and were resolved by keeping both sides' entries (the upstream S11/S13 entries and the S12 entries), so no upstream content was dropped.
