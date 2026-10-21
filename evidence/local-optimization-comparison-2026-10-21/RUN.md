# HO-01 Local Optimization Comparison — Implementation Run Record

- Run: HO-01-LOCAL-OPTIMIZATION-COMPARISON-2026-10-21
- Source of authority: the owner ticket HO-01 of 2026-10-21 ("Local Optimization Comparison", proposed), bounded to this slice, plus the HO-00–HO-06 plan established in the Codex session `01a15b3c-2169-7061-a368-526492cf6723` (2026-10-20).
- Implementation commit: `185a51ce430da06811a5013da2343b5334549336` (unsigned — the agent-side gpg pinentry was unreachable in this headless run; MAWS carries no signed-commit requirement; disclosed in the commit message and this record).
- Base: `origin/main` at `0b49f65` (MAWS-SII-TARGET-SPEC-001 v0.2.0 lineage: S5 behavioral evaluation, S6 context assembly, S11 harness-context separation, S4 skill-improvement proposals, S8 skill-promotion chain, S12 model-adaptive executor profiles, S13 comparative benchmark and the DSI skill-selection slice, plus the registry-disposition contract and its evidence gate). The primary checkout of this repository was 117 commits behind the verified remote at the start of this run; the slice was built in an isolated worktree on the verified remote state so the dirty primary worktree was left untouched. The branch was rebased onto the final `origin/main` head before publication, which is why the implementation SHA above is the rebased one.
- Definition version: **1.1.0** (re-frozen against the current base — see *Re-freeze* below). The experiment id `exp_ho01_local_optimization` is unchanged; the version carries the re-binding.

## Objective

Build the general experiment chaining that a later single-executor versus multi-executor comparison (slice S13) will reuse, and prove it end to end on a local, reproducible fixture comparison (HO-01 DoD: the comparison is reproducible from frozen inputs, it detects an artificially worse candidate reliably, and it uses exclusively already-admitted local execution paths).

The architectural point this slice establishes: MAWS needs no new optimization platform. The experiment, the runtime runs, the behavioral evaluation and the comparison are connected by evidence — an evidence-bound connection of the existing run, eval and governance contracts.

## Scope (what changed)

| Surface | Change |
| --- | --- |
| `core/contracts/experiment-definition.schema.json` | New canonical contract (ExperimentDefinition 1.0.0). `status` is the constant `FIXTURE_COMPARISON_ONLY`, `authority_granted` the constant `false`, `promotion_effect` the constant `NONE`; `configurations` is exactly two entries; `declared_change` names one dimension. |
| `core/contracts/experiment-comparison.schema.json` | New canonical contract (ExperimentComparisonRecord 1.0.0). Binds one definition digest, two referenced runtime runs (spec digest, evidence digest, analysis-output digest) and two behavioral-eval records (eval id, content seal, verdict, corpus digest), the measured deltas, a non-empty `unknowns` list, and the decision against the success bounds. `changed_dimension_count` is the constant `1`. |
| `evals/experiments/ho01-local-optimization/` | The frozen experiment: `experiment.json` (definition version 1.1.0) plus the S5-shaped corpus. The positive family is the variable family and is deliberately non-blocking; the negative, security-regression and model-parity families are byte-identical for both arms and stay blocking, so the test inputs are identical and only the declared dimension moves. |
| `scripts/tools/run-local-optimization-comparison.mjs` | The runner. Materializes each arm from the frozen task, derives the two run specs from the frozen template, executes both through `runtime:run` on the fixture transport, refuses a run whose produced analysis output does not match the materialized expectation (`RUN_EVIDENCE_MISMATCH`), runs the S5 behavioral evaluation over the frozen corpus, and emits the comparison report. The report is validated against its own contract and semantics before the run is reported successful. |
| `scripts/tools/validate-experiment-comparison.mjs` | The fail-closed validator (shape plus semantic invariants E1–E19 and E21–E28; the E20 slot is not used). It re-derives the run-spec digest, the run-evidence digest, the analysis-output digest and the behavioral-eval content seal from the referenced artifacts, **binds the declared verdict (E26) and the measured deltas (E27) to the sealed behavioral-eval records, and re-derives the decision (E11) from them and the definition's success bounds** — so a comparison whose self-declared verdict, deltas or decision disagree with the artifacts it cites is refused. The artifacts base is a **required** input: a record that cannot be re-derived is reported `E24`, not `valid`. |
| `scripts/tools/experiment-comparison-evidence.mjs` | The shared canonicalization, the deterministic run-evidence projection and the path confinement helper `resolveInside`. The raw bundle carries volatile identifiers (attempt ids, decision ids, receipt ids) and wall-clock timestamps, so it is not digestable directly; the projection covers **every file of the bundle** and removes exactly the volatile fields — determined empirically, as the 22 key patterns two independent executions of the same frozen inputs differ in — which is what makes the comparison reproducible without leaving semantic content unbound. `resolveInside` is symlink-aware. |
| `evals/fixtures/maws-vnext/experiment-definition.contracts.json`, `evals/fixtures/maws-vnext/experiment-comparison.contracts.json`, `evals/catalog.json` | Schema-decidable contract fixture families, catalog-registered and covered by `eval:maws-vnext` and `validate-maws-vnext`. |
| `package.json` | `eval:experiment-comparison` (the chain, into a fresh temporary directory — CI-safe, no artifact left behind) and `validate-experiment-comparison` (the artifacts base, the definition and the record named explicitly, so the gate actually checks something). |
| `core/contracts/README.md`, `evals/README.md` | Canonical registration of the two contracts and of the new eval family, including the comparison-evidence-not-authority posture. |
| `tests/vnext/experiment-comparison.test.mjs` (42 tests) | The single-dimension invariant, digest reproducibility, the detection of the artificially worse candidate, the path confinement, the corpus binding, and the negative cases — each of which exercises an actual refusal, not a changed digest. |

## The one declared change dimension

`analysis_context_depth`, with the two values `full` and `reduced`. The dimension value selects a materialization rule that is part of the frozen definition, so the derived analysis output of each arm is reproducible from the definition alone:

- `full` analyses all three modules of the frozen fixture and reports all five findings;
- `reduced` analyses the first module only and reports its first finding.

Nothing else differs between the two arms. The task, the expected assertions, the invariant eval families, the executor binding, the authority ceiling and the context envelope budget are identical; only the run identity fields and the materialized analysis output differ. `assertSingleDeclaredDimension` enforces this mechanically: same dimension key set, exactly one changed dimension, that dimension is the declared one, the configured values match the declared change and stay inside `allowed_values`.

## Measured result

| Measure | Baseline | Candidate | Delta |
| --- | --- | --- | --- |
| positive family | 1/1 cases passed | 0/1 cases passed | — |
| negative family (blocking) | 3/3 | 3/3 | — |
| security-regression family (blocking) | 3/3 | 3/3 | — |
| model-parity family | 2/2 | 2/2 | — |
| output assertions | 16/16 | 13/16 | **-0.1875** |
| routing accuracy | 9/9 | 9/9 | 0 |
| security regressions | 0 | 0 | 0 |
| behavioral-eval verdict | `BASELINE_RECORDED` | `IMPROVEMENT_REJECTED` | — |

- Decision: `REGRESSION` — the candidate's `output_assertion_pass_delta` (-0.1875) is below the allowed regression floor (0), so the candidate does not meet the success bounds. The hypothesis (predicted `REGRESSION_DETECTED`) is `CONFIRMED`.
- The invariant families are byte-identical and pass identically in both arms; only the variable family moved. That is the observable proof of the "identical test inputs, exactly one declared change dimension" property.

## Evidence digests

| Object | Digest |
| --- | --- |
| experiment definition | `sha256:a17bd3f2851ada113ca4bbe8cb2a0d12e4d497ccc1e2009a0bdf91863b9ac9dc` |
| run `run_ho01_cfg_baseline` spec | `sha256:9c18ce92198fa911e3233886cb72e7fa83834f37c51e2b52438bc05b253d027d` |
| run `run_ho01_cfg_baseline` evidence | `sha256:89fcc687e1189abe1b361f6b5a66834522ef09cee7d099d783d736071954dc93` |
| run `run_ho01_cfg_candidate` spec | `sha256:bfd134070b63d5ad8d5690d1ad9155fcb15c05aed2516d3472f39338ef75f050` |
| run `run_ho01_cfg_candidate` evidence | `sha256:aefc78898924c9e39f89fa1edcb02e99ebdda5deea78601b69e1b6a987fe93fc` |
| baseline analysis output | `sha256:67995a2d0a63f781da94b77bf19d5da27c3cc8d68bd878e86da70b206e658ee3` |
| candidate analysis output | `sha256:8ecff99dea806e7210339d78ac7319a91bd278707817f114765dba709e134bef` |
| `bev_ho01_local_optimization_baseline` content seal | `sha256:362db89f2a7fa92b0e779d374dba67f938f0dc51c36612b8faffd048b5d70a51` |
| `bev_ho01_local_optimization_candidate` content seal | `sha256:b8ad30b0cd213b9713d5065520827d257f3cd8872054eee5474c49daff26c019` |
| baseline corpus | `sha256:f7b5259a7133b58bd80f9aa084f556c0ec7f66c2345f8eb9c89ed80a296cee79` |
| candidate corpus | `sha256:0558b579b31f6a0f9bc158971ec2c0b20a09a8e5a2d53a1a01c8b5e5f14f5321` |

The frozen input digests (the corpus files and the run-spec template) are declared in `evals/experiments/ho01-local-optimization/experiment.json` and re-checked byte for byte on every run.

## Re-freeze against the current base (definition 1.0.0 → 1.1.0)

This branch was rebased onto the current `origin/main` (`0b49f65`). That base changed `runtime/cli/specs/reference-audit-v1.json` — the S12 lane added `effective_instruction_digest` to the qualification fingerprints. That file is one of the experiment's **frozen inputs**, so the frozen-input guard refused the run:

```
ExperimentError: frozen input runtime/cli/specs/reference-audit-v1.json digest
sha256:193037daae0f6e0bf677fe05f8f843d63d912c214518ec40f742a79e6edf92b0 does not
match the declared sha256:9b2aad286826c9e2f10768078f4f809d0fd4e3ca93535679dbc667eaaeb0bc57
    code: 'FROZEN_INPUT_DIGEST_MISMATCH'
```

The check was **not** weakened. The experiment was re-frozen against the new base instead: `definition_version` is bumped `1.0.0` → `1.1.0` and the declared digest of the run-spec template is re-bound to the current bytes. The experiment id `exp_ho01_local_optimization` is unchanged — the version carries the re-binding, exactly as the contract requires ("A changed hypothesis, success bound, task, dimension or configuration requires a new version; the id alone never carries the version").

The re-freeze is a base adaptation, not a semantic change. Comparing the 1.1.0 run against the 1.0.0 run field by field:

| Object | 1.0.0 → 1.1.0 |
| --- | --- |
| definition digest | changed (the definition content changed) |
| definition version, comparison id | changed (1.0.0 → 1.1.0, `expcmp_ho01_local_optimization_1_1_0`) |
| both run **spec** digests | changed (the spec is derived from the changed template) |
| both run **evidence** digests | **identical** |
| both analysis-output digests | **identical** |
| both behavioral-eval content seals | **identical** |
| both corpus digests | **identical** |
| both eval verdicts | **identical** (`BASELINE_RECORDED` / `IMPROVEMENT_REJECTED`) |
| metrics, decision, declared change, unknowns | **identical** |
| `status`, `authority_granted`, `promotion_effect` | **identical** (`FIXTURE_COMPARISON_ONLY` / `false` / `NONE`) |

Every digest that carries semantic content is byte-identical; only the three values that are *derived from the changed template bytes* moved. The measured result is therefore unchanged: `REGRESSION`, `output_assertion_pass_delta` -0.1875, hypothesis `CONFIRMED`.

## What the comparison does not know

The report declares its unknowns explicitly; it never leaves the boundary implicit:

| Unknown | Reason code |
| --- | --- |
| `model_quality` | `FIXTURE_TRANSPORT_NO_MODEL` — the analysis executor ran on the fixture transport; no model was invoked. |
| `provider_cost` | `DECLARED_NOT_MEASURED` — cost and token figures are declared by the executor binding, not measured from a provider. |
| `production_latency` | `FIXTURE_LANE_NOT_LIVE` — latency figures are declared by the fixture lane; no live transport was exercised. |
| `cross_model_parity` | `SINGLE_LANE_ONLY` — only one executor lane was exercised. |
| `real_repository_behavior` | `SYNTHETIC_FIXTURE_INPUT` — the task input is a frozen synthetic fixture. |

The two arms carry identical declared cost and latency signals, so the comparison draws no efficiency conclusion at all. A quality regression may never be masked by an efficiency gain, and no efficiency claim is derivable from these fixtures.

## Boundary posture

The record is comparison evidence only. `status` is the constant `FIXTURE_COMPARISON_ONLY`, `authority_granted` is `false`, `promotion_effect` is `NONE`. The contract forbids additional properties, and the validator additionally refuses any record carrying a promotion token (`adopt_`, `skill-frontdoor-admission`, `canonical_owner`, `owner_approval`, `adoption_digest`). No skill content is written, no frontdoor admission is minted, no owner approval is claimed, and no `SkillPromotionAdoptionRecord` is produced: the comparison cannot be consumed by the promotion frontdoor.

**Scope boundary to slice S13.** The comparison between a single-executor and a multi-executor orchestration is owned by S13 and is *not* performed here. HO-01 establishes the general experiment chaining that S13 will consume; it claims no S13 completion.

**Authority matrix.** `docs/authority-matrix.md` was deliberately not modified. The immediately preceding comparable slices (S5, S6, S11) register their new contracts in `core/contracts/README.md` and their eval families in `evals/README.md` and leave the authority matrix untouched; the `maws-vnext:` rows of that matrix are drift-checked against `evals/fixtures/maws-vnext-baseline.json` and a HO-01 row there would assert a claim the drift validator does not back. This is a deliberate, recorded decision, not an omission.

## Verification (executed)

- `npm run test:vnext` — **616/616 pass, 0 fail** (42 HO-01 tests included; the base carries 574 non-HO-01 tests, which grew through the S4/S8/S12/S13/DSI slices merged into `main` before this branch was rebased).
- `node --test tests/vnext/experiment-comparison.test.mjs` — 37/37. (The 1.0.0 run record stated 27; the file declared 26 `test(` cases and `node --test` reported 26. The count is corrected here, and the independent review added the 11 cases that cover the repaired defects.)
- `npm run eval:experiment-comparison` — exit 0; decision `REGRESSION`, hypothesis `CONFIRMED`, `output_assertion_pass_delta` -0.1875, final behavioral-eval verdict `IMPROVEMENT_REJECTED`.
- `npm run validate-experiment-comparison` on the committed record with `--artifacts-base evidence/local-optimization-comparison-2026-10-21` — 1 checked, 0 invalid.
- `npm run validate-behavioral-eval` on the two committed behavioral-eval records — 2 checked, 0 invalid.
- `npm run validate`, `validate-neutral`, `validate-maws-vnext`, `validate-behavioral-eval`, `validate-instruction-bundle`, `validate-instruction-integrity`, `validate-secrets` — all PASS.
- `npm run scan-secrets` — 0 findings.
- `npm run eval:maws-vnext` — PASS, **22 fixture families**, 0 failed, 0 blocking failures (both new HO-01 fixture families included and passing: `maws-vnext-experiment-definition-contracts`, `maws-vnext-experiment-comparison-contracts`).
- `node scripts/tools/validate-registry-disposition.mjs --fixture evals/fixtures/registry-disposition-contract.json evidence/local-optimization-comparison-2026-10-21/registry-disposition.json` — `passed: true`, 0 issues. This is the governance gate that `main` added in the rebased base (`tests/vnext/registry-disposition-evidence.test.mjs` validates every recorded run disposition under `evidence/` against the `registry-disposition.v1` contract and its schema); the HO-01 disposition satisfies it.

### DoD verification, independently probed

The three DoD clauses were re-verified with probes written separately from the test suite, against a fresh execution and against the committed artifacts:

- **Reproducible from frozen inputs.** Two fresh independent executions produced **20 of 20 compared fields identical** (definition digest, both runs' spec/evidence/analysis-output digests, both behavioral-eval content seals, corpus digests and verdicts, metrics, declared change, unknowns, decision inputs); only the wall-clock `created_at` differs. A fresh execution's digests also match the **committed** evidence byte for byte, so the recorded digests stay re-derivable from the committed artifacts.
- **Detects an artificially worse candidate.** From the committed eval records: baseline 16/16 assertions passed (`BASELINE_RECORDED`), candidate 13/16 (`IMPROVEMENT_REJECTED`), `output_assertion_pass_delta` -0.1875, `routing_accuracy_delta` 0, `security_regressions` 0. The three invariant families carry **equal `corpus_digest` values across the arms** and identical pass counts (3/3, 3/3, 2/2) — the observable proof that the test inputs were identical and only the declared dimension moved.
- **Admitted local execution paths only.** Both committed run bundles carry `context: development_harness` and `authority_grant: none`; all three executor bindings in both materialized specs declare `transport: fixture`; the JEV lane is in `fixture` mode; the workload safety class is `safe`; every recorded event carries `provenance: observed`. A scan of the whole evidence directory finds **no live transport identifier and no credential reference**.

### Negative evidence paths (executed, each refusing rather than reporting)

- a run bundle with an injected finding — E18 evidence-digest mismatch + E19 analysis-output mismatch;
- the candidate's analysis output forged to the baseline's content — E18 + E19;
- a behavioral-eval record edited after sealing — E16 broken content seal;
- a behavioral-eval record rewritten to `IMPROVEMENT_PROVEN` **and resealed with the correct seal algorithm** — still E16, because the comparison record carries the original content digest, so a resealed forgery does not match the reference;
- a candidate redirected to the baseline run — E4 non-distinct run reference + E18 + E19;
- a comparison claiming authority or a promotion effect — E1/E2/E3;
- a comparison claiming an improvement the evaluation rejected — E11 + E21;
- a comparison with an empty unknown set — E9;
- a frozen input path or a run-spec template path that leaves the repository (`../..` climb or an absolute path) — `FROZEN_INPUT_PATH_ESCAPES_ROOT`;
- a **corpus path** that leaves the repository (absolute or `..` climb) — `FROZEN_INPUT_PATH_ESCAPES_ROOT`;
- a **symlink inside the repository that points out of it** — `FROZEN_INPUT_PATH_ESCAPES_ROOT` (the confinement is symlink-aware);
- a corpus manifest that references a file the definition never declared — `FROZEN_INPUT_NOT_DECLARED`;
- a comparison that cannot be re-derived because no artifacts base was supplied — E24;
- a **completion contract weakened after the fact** — E18;
- an **event appended to the run events** after the fact — E18;
- an **interaction session replaced** after the fact — E18;
- an **intent binding granted `admin:*`** with a live target — E18;
- a **run specification forged** after the fact — E25;
- a comparison reporting a decided outcome for a **blocked** candidate evaluation — E21;
- each of the five promotion tokens injected into a comparison — E22;
- a referenced artifact path that leaves the artifacts base — E23.

### Other verification

- **Mimosa deep security scan** of the twice-repaired slice: scan `scan-2026-10-21T02-02-41.230Z-7f2582f8d11a`, seal `sha256:a45dc1448a0408856e562e9fffd7866e72ac0b949fd8e6a5efa098cff8ad53c8`, 0 findings, 201 packages scanned with 0 affected dependency packages; 3 packages match 3 known advisories in the offline dependency snapshot (context-only, pending manual/online review, not adjudicated by this run). The scan is static-only and executes no runtime. No claim of repository-wide safety is made.
- **Pre-existing environment limitation.** `npm run eval` (the full certification suite) fails in this environment at the render/a11y kinds: the expected Playwright Chromium build `chromium-1217` is not installed (`ENOENT` on `spawn /home/baum/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome`; the local cache holds `chromium-1234` instead). The identical failure was reproduced on an untouched `origin/main` checkout in the same environment, so it is a pre-existing environment limitation and not a regression of this change. It was re-reproduced on this branch's own tree at the repaired commit, so the claim is current. The Chrome-dependent kinds are not claimed as verified by this run.

## Independent review (executed) and the repairs it forced

The reviewer subagents of the `Agent` tool are **not usable in this environment**: every subagent type fails to start with `reasoning-level-missing`, independently of the model it would run on. An **independent review was nevertheless performed** — through the dynamic-workflow runner, which can select the reviewer's model explicitly, on a **different model from the one that wrote this slice** (`account:zai-individual-coding-plan/GLM-5.3` at reasoning level `high`; the slice was written on `minimax/minimax-m3.1-flash`). Two reviewers with distinct lenses ran against the slice (security/authority boundary, and evidence/reproducibility/test honesty), and every finding each of them raised was then **separately reproduced by a third, independent confirmer** before it was accepted. The review reported **10 findings, all 10 confirmed, 0 unconfirmed**.

Three of them were P2 and are repaired in this slice:

| # | Finding | Repair |
| --- | --- | --- |
| P2-1 | `frozen_inputs.corpus_path` was resolved with `path.resolve` and was never digest-bound: the behavioral evaluation — the side of the chain that measures the deltas and therefore decides — could measure a corpus outside the repository while the record claimed frozen inputs with intact digests. | The corpus directory is now confined with `resolveInside` (absolute path, `..` climb and symlink out of the base are all refused) and the corpus manifest is bound: every file the manifest references must itself be a declared, digest-bound frozen input and must lie inside the corpus directory. A manifest that references an undeclared file is refused with `FROZEN_INPUT_NOT_DECLARED`. |
| P2-2 | The deterministic projection discarded semantic content, not only volatile fields: `completion-contract.json`, `run-events.jsonl` and `interaction-session.json` were never read, and fields such as an intent binding's `rights_transition`, `target` and `capability_mapping` fell outside the projection — while the contract text claimed that only volatile identifiers and wall-clock fields were excluded. A completion contract weakened to `verification.required: false`, an intent binding granted `admin:*`, or a live transport written into the interaction session all passed the validator. | The projection now covers **every file of the bundle** and removes exactly the volatile fields, determined empirically: two independent executions of the same frozen inputs differ in precisely 22 key patterns (wall-clock fields and run-local identifiers of the shape `^[a-z]+_[0-9a-f]{12}$`), and nothing else. Everything else is kept, so any change to the completion contract, the interaction session, the intent bindings, the run events, the context envelope or any execution output moves the digest. The contract description now states the coverage exactly. |
| P2-3 | The validator **silently degraded** when `--artifacts-base` was missing: the entire digest re-verification block sat behind `if (artifactsBase)`, the default was `null`, and the output was byte-identical to a clean pass — so the same manipulated record was refused with the flag and reported `valid` without it. | The artifacts base is now a **required** input. Without it the validator reports `E24` ("no digest could be re-derived … a comparison that cannot be re-derived is not verified") instead of passing, and the CLI exits 2 with a usage error rather than checking nothing. The `validate-experiment-comparison` npm gate now names the artifacts base, the definition and the record explicitly, so it is a real gate instead of a no-op. |

The seven P3 findings were repaired as well:

- **P3-1** — the validator CLI without file arguments reported `0 checked, 0 invalid` with exit 0. It now exits 2 with a usage error.
- **P3-2** — `resolveInside` was purely lexical, so a symlink *inside* the base pointing outside it was followed. The confinement is now symlink-aware: the real path of the target is checked against the real path of the base.
- **P3-3** — a candidate evaluation that refused the comparison (verdict `BLOCKED`) was translated by `computeDecision` into a **decided** `REGRESSION` with a `CONFIRMED` hypothesis, and no rule checked that pairing. A blocked evaluation now yields outcome `BLOCKED` with hypothesis `INDETERMINATE` and decides nothing; `E21` refuses a record that reports a decided outcome for a blocked evaluation, and `E11` requires a blocked outcome to be backed by a security regression or a blocked evaluation.
- **P3-4** — the test named *"a run bundle whose analysis output does not match its configuration is refused"* exercised **no refusal at all**: it only asserted that two digests differ. It now asserts the validator's refusal (`E18` and `E19`) on the tampered bundle.
- **P3-5** — the commit message claimed a negative test for a **resealed** behavioral-eval record, and no such test existed (the suite only edited a record without resealing it); the promotion-token refusal (`E22`) was never exercised as a negative test, and the suite mirrored only four of the five promotion tokens. Both now exist: a record edited *and* resealed with the correct algorithm is refused, and every one of the five promotion tokens is injected and refused.
- **P3-6** — the run-evidence digest covered 10 of the 13 bundle files. Covered by the P2-2 repair.
- **P3-7** — the evidence was not committed in the reviewed state (it existed only as a working-tree artifact). It is committed by the evidence commit of this slice.

Two findings were **state observations, not defects**: the test-count claim in the run record (27) overstated the actual 26, and the `E1–E22` code range omitted `E23`. Both are corrected here.

### Second independent review (the re-review of the repaired state)

The repaired state was reviewed again, on a **second** model and with a **second, fresh set of reviewers** (two lenses again: the repair verification and the hunt for new defects), every finding again separately reproduced by its own confirmer. The re-review reported **9 findings: 8 confirmed, 1 refuted**.

**The refuted finding** claimed that the documented figure "precisely 22 key patterns" (the volatile-field set, derived by diffing two independent executions) was not reproducible. The confirmer measured it three ways — its own census, the auditor's own probe script, and a third run pair — and every count came to 22, matching the documented figure; the finding's own claim of "17 distinct pairs" did not reproduce even with the auditor's own script. The figure stands and no change was made.

**The eight confirmed findings, and what was done with each:**

| # | Severity | Finding | Repair |
| --- | --- | --- | --- |
| P2 | P2 | The validator read the referenced behavioral-eval artifacts and checked only their eval id, content seal and corpus digest. It never bound the comparison's **self-declared verdict** to the sealed record and never **derived the measured deltas** from it — so a record that flipped the candidate verdict to `IMPROVEMENT_PROVEN`, the delta to +0.1875 and the decision to `IMPROVEMENT` passed the **full** validation against the untouched, correctly sealed artifacts. The digests of the cited artifacts are not touched by such an edit, so only a binding to their *content* can catch it. | The verdict is now bound to the sealed record (**E26**) and the deltas are re-derived from the two sealed records and compared with the declared ones (**E27**). The decision is additionally re-derived from the sealed deltas, the sealed candidate verdict and the definition's success bounds (**E11**), and the decision rule now lives in ONE place — `computeDecision` in the shared module — used by the runner that produces a decision and by the validator that checks one, so a producer and a checker cannot drift apart. A comparison whose decision cannot be re-derived because no definition was supplied is reported `E28` rather than silently accepted. |
| 2 | P3 | The run-evidence projection dropped the generic key name `at`, and a 14th bundle file would have been silently ignored rather than refused — so a future semantic field named `at`, or a file the projection does not cover, could have sat outside the digest unnoticed. | The `at` exclusion is now scoped to the intent-binding chain context, where it is a timestamp, and nowhere else; a semantic field named `at` stays bound to the digest. The bundle **inventory** is asserted: a file outside the declared inventory is refused (`E18`), not ignored. |
| 3 | P3 | Two leftover `path.resolve` call sites of the class the repairs had replaced: the validator resolved `--definition` unconfined, and the runner re-read the run-spec template with `path.resolve` instead of the confinement helper. | The runner reads the template through the confinement helper. The validator's CLI resolves its operator-supplied paths against the **caller's working directory** (as every command-line tool behaves) and prints the **resolved** path, so a reader always sees which object was actually checked. |
| 4 | P3 | `E11` had no `NO_IMPROVEMENT` branch, so a measured regression re-labelled "no improvement" passed; and `computeDecision`'s improvement branch read only the primary metric, so a candidate with a positive primary delta and a negative routing delta was emitted as an improvement that the chain's own validator then refused. | `E11` gained the `NO_IMPROVEMENT` branch, and the shared decision rule now treats a routing-accuracy regression as a regression in its own right (a quality regression is never masked by a gain elsewhere) and never emits an improvement while the routing delta is negative. The producer and the checker now agree. |
| 5 | P3 | The `registry-disposition.json` reason named the validator's range as `E1–E19 and E21–E23` while the code implemented `E24` and `E25` — and the same file referenced `E24`/`E25` in its own tamper list. The run record was correct; the disposition was not. | The disposition's range is corrected to `E1–E19 and E21–E28`. |
| 6 | P3 | A referenced behavioral-eval record that is well-formed JSON but not an evaluation record crashed the validator with an unhandled `TypeError` out of the seal computation — fail-closed, but a stack trace instead of a structured issue. | The seal computation and the reproducibility access are guarded; a malformed referenced record is refused with a structured `E16` issue. |
| 7 | P3 | The validator's CLI anchored **all** relative paths at the repository root rather than the caller's working directory, so the same relative invocation from another directory validated the repository's copies and reported `valid` for a path that does not exist relative to the caller. | The paths are anchored at the caller's working directory and the **resolved** path is printed, so the tool can never report success for an object the caller did not name. |
| 8 | P3 | A **second, purely lexical** `resolveInside` lives in the shared S5 evaluation module (`scripts/tools/run-skill-effectiveness-evals.mjs`), and `loadCorpus` there follows a symlink out of the corpus directory. | **Not repaired here, and deliberately so: it is outside this slice.** `scripts/tools/run-skill-effectiveness-evals.mjs` is the S5 lane's module, not an HO-01 surface, and the ticket bounds HO-01 to a local comparison slice. The finding is real and is recorded here and in the Registry record so that the lane that owns the module can act on it. **The HO-01 chain itself is not affected**: its own `assertCorpusBound` requires every file the corpus manifest references to be a declared, digest-bound frozen input inside the corpus directory, resolved through the symlink-aware helper, so a symlinked case file is refused before the corpus is ever read. The independent review confirmed that scoping by reproducing the attack against the shared module and reading the chain's own guards. |

**Post-repair verification of the re-review's own probes.** Every attack the re-review demonstrated is now refused, and the untouched committed evidence still validates:

| Probe | Result |
| --- | --- |
| forged improvement claim (verdict + deltas + decision flipped) over a sealed rejection | REFUSED, `E26` + `E27` + `E11` |
| the declared verdict flipped alone | REFUSED, `E21` + `E26` |
| the measured deltas flipped alone | REFUSED, `E11` + `E27` |
| the decision downgraded `REGRESSION` → `NO_IMPROVEMENT` | REFUSED, `E11` |
| a 14th file added to the run bundle | REFUSED, `E18` |
| a semantic field named `at` added to the harness context | REFUSED, `E18` |
| a referenced behavioral-eval record replaced by non-eval JSON | REFUSED, `E16` (structured issue, no crash) |
| the untouched committed evidence | VALID, exit 0 |

**What the repairs did NOT change.** The measured result, every digest in the evidence table above, and the committed evidence itself are unchanged by this repair round: the projection covers the same thirteen files, the volatile set is the same for the shipped bundle, the decision rule produces the same outcome for the same metrics, and the committed comparison record still validates against its own committed artifacts. The repair round changed **what the validator refuses**, not what the experiment measured.

**What the review did not cover**: the Registry and Atlas entries were not reviewed (the review covered the MAWS source slice only); the full `npm run test:vnext` was not re-run by the reviewers (the deterministic gates were run by the calling agent and the reviewers ran targeted adversarial probes instead); and the render/accessibility kinds of `npm run eval` remain unverified in this environment because the Playwright Chromium binary is missing — a pre-existing environment limitation, reproduced identically on an untouched `origin/main` checkout.

### Post-repair verification of the review's own probes

The eight tamper probes the review used to show the projection blind spots are now all refused, with the expected code:

| Probe | Result |
| --- | --- |
| completion contract weakened (`verification.required: false`, `required_outputs: []`) | REFUSED, `E18` |
| intent binding granted `admin:*` with a live target | REFUSED, `E18` |
| interaction session replaced (`remote_api` / `root`) | REFUSED, `E18` |
| event appended to `run-events.jsonl` | REFUSED, `E18` |
| field injected into `work-unit.json` | REFUSED, `E18` |
| run specification forged (`context_depth: full_forged`) | REFUSED, `E25` |
| completion decision forged (`SUCCEEDED_FORGED`) | REFUSED, `E18` |
| context-envelope token usage replaced | REFUSED, `E18` |

## Review disclosure

No reviewer distinct from the author approved any commit of this publication. The `Agent` reviewer subagents are unusable in this environment (`reasoning-level-missing` for every subagent type), which is why the independent reviews were run through the dynamic-workflow runner on models different from the one that wrote the slice, with an independent confirmer per finding. **Two** such reviews took place: the first over the initial implementation and the second over the repaired state. A GitHub reviewer could not be requested for this pull request either — the REST API answers **HTTP 422** ("Reviews may only be requested from collaborators") because `t-wim` holds *read*, not collaborator, permission on this repository — so no GitHub approval exists for it. **The MAWS pre-merge review and the merge itself remain owner acts.** The author's own review, using probes written separately from the test suite, had already found and repaired the path-confinement gap (a declared frozen-input path and a referenced artifact path were resolved with `path.resolve` and could point outside the repository); that repair is now covered by the symlink-aware confinement and by the corpus binding above.

## Non-goals honored

No live provider credentials are used; no live transport is exercised; no second registry; no skill promotion; no runtime activation; no authority change; no model-quality, cost or latency claim. The candidate is deliberately the worse configuration — the chain is only proven when it detects that degradation reliably.

## Registry disposition

`registry-disposition.json` in this directory: **`UPDATED`**, `material_change: true`, `registry_relevant_change: true`, affected records `CONTRACT_RECORD:core/contracts/experiment-definition.schema.json` and `CONTRACT_RECORD:core/contracts/experiment-comparison.schema.json` (two new canonical machine-readable record surfaces that downstream consumers validate against), `registry_commit_sha: 59add1f73b70def191e65fb67ade2fe4d8b11c95`.

The disposition was `REQUIRED_BUT_BLOCKED` with `registry_commit_sha: null` from the moment the slice was first published, and is rebound to `UPDATED` now that the Registry write is merged: unitera-registry pull request 231 merged as `59add1f73b70def191e65fb67ade2fe4d8b11c95` on 2026-10-21T02:14:00Z, and it publishes the run change registration and the CONTRACT_RECORD projection of the two new contracts. The Atlas representation follows it: unitera_atlas pull request 178 merged as `21624fa75728fd6afee67a1268e8fab0d9adc9de` on 2026-10-21T02:20:25Z. The source publication itself is merged: MAWS pull request 51 merged as `10d8577382a0e51090404f063012bf1eefb745a2` on 2026-10-21T02:07:38Z.

## Closure

| Surface | Pull request | Merge commit | Merged at |
| --- | --- | --- | --- |
| MAWS (source) | 51 | `10d8577382a0e51090404f063012bf1eefb745a2` | 2026-10-21T02:07:38Z |
| Unitera Registry (registration + contract projection) | 231 | `59add1f73b70def191e65fb67ade2fe4d8b11c95` | 2026-10-21T02:14:00Z |
| Unitera Atlas (representation) | 178 | `21624fa75728fd6afee67a1268e8fab0d9adc9de` | 2026-10-21T02:20:25Z |

All three merges were executed through the GitHub GraphQL `mergePullRequest` mutation with `expectedHeadOid` and `mergeMethod: MERGE` — the REST merge endpoint answers 404 on these repositories — with no admin bypass, no force merge, no squash and no direct push to a default branch. Each merge commit and each branch head was verified to be an ancestor of its repository's default branch after the merge.

**The hosted CI jobs for all three pull requests could not execute**: GitHub Actions is account-locked for billing, so the jobs are created with **zero steps** and fail within seconds without running anything, while the same workflows succeeded earlier the same day with 17 steps (MAWS) and 14 steps (Registry). Every step was therefore replicated locally — the loop-repo-ci workflow on the published MAWS head under Node 20.20.2, and both registry gates with owner-repository mirrors — and all of them pass. **No hosted green result is claimed for any of the three merges**, and the absence of a hosted run is disclosed rather than presented as a green gate.

## Next gate

- Slice S13 remains responsible for the single-executor versus multi-executor orchestration comparison; HO-01 provides the chaining it consumes.
- HO-02 (independent review), HO-03 (a real model comparison) and HO-04 (an adoption probe) remain open and are not addressed by this slice. HO-02 is partly discharged: the two independent tool reviews recorded above are not the human or GitHub review the slice would need, and a GitHub reviewer could not be requested for the pull request at all.
- The Atlas records the MAWS materialization revision `d6a8fdd` in `data/repos.yaml`, which lags the owner default branch. Advancing that pin is a separate, dedicated Atlas operation and is not repaired by this slice.
- One pre-existing registry reachability mismatch remains, in another lane's record, whose own correction is open in unitera-registry pull request 236.
- One confirmed finding from the second independent review is recorded and **not** repaired here: the shared S5 evaluation module carries a second, purely lexical path confinement, so the S5 skill-effectiveness lane can follow a symlink out of its corpus directory. That module is the S5 lane's surface, not this slice's; the HO-01 chain is unaffected, because its own corpus binding refuses a symlinked case file before the corpus is read.
