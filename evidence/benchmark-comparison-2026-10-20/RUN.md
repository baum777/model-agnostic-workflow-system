# S13 Run Record — Comparative Benchmark Harness (2026-10-20)

- Spec binding: `MAWS-SII-TARGET-SPEC-001` v0.2.0 (PROPOSED), slice S13 + section 10.6.
- Source of authority: bounded owner run directive of 2026-10-20 ("run S11 implementierung und closure S7, S13 und S8"). Materialization only; the specification stays PROPOSED, no runtime authority is granted, no model or executor is qualified by this slice.
- Branch: `s13/benchmark-comparison-20261020b`, based on `main` at `2cd0edc` (the S11 merge). The earlier stacked branch `s13/benchmark-comparison-20261020` and its PR were superseded.

## What was implemented

- `core/contracts/benchmark-record.schema.json` — ComparativeBenchmarkRecord 1.0.0: fixed task-set ref, eval family, authority domain, baseline (`single_executor`) and candidate (`policy_bound_multi_executor`) variants that share one executor profile, per-task + total measures (tokens, cost, latency, interventions, verification outcome, artifact quality), checked `context_isolation` and `authority_budget_inheritance` (with the measured violations), derived `selection_criteria` (composed / single-executor / counterproductive cases), and `comparison_only` const `true`.
- `evals/benchmark/comparison/tasks.json` — the fixed benchmark task set (2 atomic + 1 decomposable task) with independent acceptance criteria, the recorded artifact of each variant, the composition policy the candidate is bound to (`comp_benchmark_comparison_v1`, mode `independent_parallel`, max 2 executors, parallelism bound 2, budget cap 100), the parent authority scope, the one shared executor profile, and the independent verifier executor.
- `scripts/tools/run-comparative-benchmarks.mjs` — the harness: fail-closed task-set loader, fixture worker execution with per-session S11 harness contexts (unique context ids, own payload object, no foreign session leakage), candidate composition through the REAL `buildComposition` policy gate (translated into the runner's fail-closed error contract) plus the policy parallelism bound, the derived verification outcome (independent verifier executor over the merged artifact) and artifact quality (recorded artifact content against the quality floor), derived counterproductive cases (compositions the candidate actually evaluated through the gate and then rejected because the measurement was worse), authority/budget inheritance checks, semantic rules, isMain-guarded CLI (`npm run eval:benchmark-comparison`).
- `evals/fixtures/maws-vnext/benchmark-record.contracts.json` — 4 schema-decidable cases (valid record; rejected approval claim via `comparison_only: false`; rejected unbound baseline variant; rejected counterproductive case without a measured dimension); catalog-registered.
- `tests/vnext/benchmark-comparison.test.mjs` — 29 tests.
- READMEs (`core/contracts/README.md`, `evals/README.md`), `package.json` (`eval:benchmark-comparison`), `evals/catalog.json`, `CHANGELOG.md`.

## Slice checkbox mapping

| Checkbox | Evidence |
| --- | --- |
| Benchmark-Aufgabensatz (statisch + dynamisch) | `evals/benchmark/comparison/tasks.json`, loader fail-closed tests |
| Single-Executor-Baseline gefahren | `runVariant` static; baseline totals in record |
| Policy-gebundene Multi-Executor-Variante gefahren | `runVariant` dynamic via real `buildComposition` (`composition_ref` on the composed task) |
| Token/Kosten/Laufzeit/Interventionen/Verifikation/Artefaktqualität gemessen | per-task + totals in the record; verification and quality are derived, not asserted |
| Context-Isolation geprüft | per-worker unique harness contexts, own payload object, no foreign session leakage; fail-closed `CONTEXT_ISOLATION_VIOLATED` |
| Geerbte Authority-/Budget-Grenzen geprüft | `checkAuthorityBudgetInheritance` (parent scope, safety class, no authority aggregation, declared parent cap) + negative tests |
| Kontraproduktive Fälle dokumentiert | compositions the candidate evaluated through the policy gate and then rejected because the measurement was worse; each case names the measured dimensions and the evaluated composition |
| Auswahlkriterien festgehalten | `selection_criteria` partition with the decomposable-only composition rule, the measured-advantage rule and the composed/counterproductive disjointness rule |

## Boundary posture (spec 10.6 Grenzen)

- Decomposition is never chosen because multiple executors are available: an atomic task stays single-executor even in the candidate variant (fail-closed when violated).
- The record is a comparison basis only (`comparison_only` const `true`): no approval for broader autonomy, no qualification, no own success assertion.
- Baseline and candidate run the same fixed task set, the same eval family and the same executor profile; only the orchestration form differs. Every executor that runs in either variant must implement the shared profile (`BENCHMARK_EXECUTOR_PROFILE_MISMATCH` otherwise).
- Verification is performed by an independent verifier executor that may not have produced part of the artifact (`BENCHMARK_VERIFICATION_NOT_INDEPENDENT` otherwise).
- Deterministic fixture metrics: the harness measures the recorded fixture profiles, not live model runs; it proves the measurement and selection machinery, not a production performance claim.

## Review round 1 — findings and repair

An independent review of the first S13 implementation (PR #48, head `d7c7b0c`) found the governance envelope sound but the measured dimensions weak: the verification outcome and the artifact quality were constants or self-fulfilling, the "goes through the real gate" claim was untested, and the counterproductive list was fixture-authored prose. All findings were repaired before the merge; the review is documented in the pull request.

| Finding | Repair |
| --- | --- |
| `verification_outcome` hardcoded to `PASS`; the `verification` block was dead input | The task set's `verification.verifier_executor_id` is now the executor that produces the verdict; a missing required field turns the outcome into `FAIL`. The verifier may not be one of the producing executors. `verification.independent: false` fails the task set closed. |
| The suite passed with the real composition gate removed | The candidate composition and the evaluated counterfactual compositions go through `buildComposition`; a policy rejection is translated into `BENCHMARK_COMPOSITION_REJECTED`. Negative tests cover the executor bound, the allowed mode and the parallelism bound. |
| The "counterproductive cases" were not cases of counterproductive parallelization | The candidate now evaluates a declared composition option through the same policy gate; the case is recorded only when the measured result is worse than the single-executor baseline, and the reason names the measured dimensions. A better counterfactual drops the case. |
| A task could be composed and counterproductive at the same time; no "the candidate must win" signal | Semantic rules refuse a task that is in both lists, and refuse a composed task without a measured advantage over the baseline. |
| `budget_within_parent_cap: true` without a declared cap | The parent cap is mandatory in the task set; a policy without one fails closed. |
| The authority half of the inheritance check was a safety-class set only | The check now covers the parent scope of every child ceiling, the policy safety class, the absence of authority aggregation in every composition and the composition ceiling against the task's child ceiling, and reports the measured violations. |
| `max_parallelism` was never enforced | The harness enforces the bound explicitly (`BENCHMARK_PARALLELISM_LIMIT_EXCEEDED`); `buildComposition` only bounds the executor count. |
| Baseline and candidate did not share an executor profile | One shared profile per comparison; every executor of both variants must implement it, and the record carries the profile reference of both variants. |
| `artifact_quality` could only ever be `MEETS_CRITERIA` | The artifact is the recorded fixture artifact, partitioned across the workers; the quality floor is measured against the recorded content, and the measurement is independent of the verification verdict. |
| `eval_family` and `authority_domain` were never carried | Both are required record fields and are checked against the task set. |
| Gate violations escaped as an uncaught `FailClosedError` | Every gate rejection is translated into the runner's `BenchmarkConfigError` contract, and the CLI reports it as an issue instead of a stack trace. |
| The "no decomposition by default" test depended on the fixture array order | The tests address tasks by id. |
| The cost totals were rounded while the semantic check compared with a 1e-9 tolerance | The totals are the exact per-task sum. |

## Verification

- `node --test tests/vnext/*.test.mjs` — 417/417 PASS (includes the 29 S13 tests).
- `npm run eval:maws-vnext` — ok:true (benchmark fixture included).
- `npm run validate-maws-vnext` — issues: [].
- `npm run eval:benchmark-comparison` — exit 0, record valid: parallel win on `bench_task_decomposable_audit` (latency 6400→3600 ms, cost 24→21, interventions 1→0), counterproductive cases derived for both atomic tasks (cost_units, latency_ms, interventions), 7 isolated sessions (4 workers + 3 verifiers), inheritance checked with 0 violations.
- Mutation probes on the harness (each probe is bound by at least one failing test): real composition gate stubbed → 21 failing tests; `verification_outcome` hardcoded → 1 failing; `artifact_quality` hardcoded → 1 failing; parallelism bound removed → 1 failing; counterproductive derivation forced → 2 failing; shared-profile check removed → 1 failing; verifier-independence check removed → 1 failing; measured-advantage rule removed → 1 failing; composed/counterproductive disjointness rule removed → 1 failing.

## Open obligations (not closed by this run)

- **Registry registration: OPEN (REQUIRED_BUT_BLOCKED).** The run change registration and the `CONTRACT_RECORD` for `core/contracts/benchmark-record.schema.json` are written after this branch merges, in `unitera-registry`; the local `registry-disposition.json` stays `REQUIRED_BUT_BLOCKED` until that publication exists and the disposition is rebound to `UPDATED` with the registry commit sha.
- **Atlas representation: OPEN (REQUIRED_BUT_BLOCKED).** The Atlas claim for this slice is written after the Registry publication.
- **Independent review limitation.** The codex review connector was exhausted (quota) for this slice; the independent review was performed by a local audit agent (a different model, tool-driven, with mutation probes). No human approval is claimed, and the slice is not presented as codex-reviewed.
