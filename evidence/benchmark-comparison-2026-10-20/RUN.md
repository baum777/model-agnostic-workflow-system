# S13 Run Record — Comparative Benchmark Harness (2026-10-20)

- Spec binding: `MAWS-SII-TARGET-SPEC-001` v0.2.0 (PROPOSED), slice S13 + section 10.6.
- Source of authority: bounded owner run directive of 2026-10-20 ("run S11 implementierung und closure S7, S13 und S8"). Materialization only; the specification stays PROPOSED, no runtime authority is granted.
- Branch: `s13/benchmark-comparison-20261020`, stacked on `s7/qualification-integration-20261020` (which is stacked on `s11/harness-context-20261020`); rebased per stack as the predecessor PRs merge.

## What was implemented

- `core/contracts/benchmark-record.schema.json` — ComparativeBenchmarkRecord 1.0.0: fixed task-set ref, baseline (`single_executor`) and candidate (`policy_bound_multi_executor`) variants, per-task + total measures (tokens, cost, latency, interventions, verification outcome, artifact quality), checked `context_isolation` and `authority_budget_inheritance`, derived `selection_criteria` (composed / single-executor / counterproductive cases), and `comparison_only` const `true`.
- `evals/benchmark/comparison/tasks.json` — the fixed benchmark task set (2 atomic + 1 decomposable task) with independent acceptance criteria, deterministic per-variant metric profiles, and the composition policy the candidate is bound to (`comp_benchmark_comparison_v1`, mode `independent_parallel`, max 2 executors, budget cap 100).
- `scripts/tools/run-comparative-benchmarks.mjs` — the harness: task-set loader (fail closed), fixture worker execution with per-session S11 harness contexts (unique context ids, no shared payload objects), candidate composition through the REAL `buildComposition` policy gate, authority/budget inheritance checks (safety-class subset + budget cap), artifact-quality evaluation against the acceptance criteria, counterproductive-case derivation (candidate overhead on single-executor tasks), semantic rules (`semanticBenchmarkIssues`: same-task-set, totals add-up, partition matches task kinds, inheritance/isolation pass, comparison-only), isMain-guarded CLI (`npm run eval:benchmark-comparison`).
- `evals/fixtures/maws-vnext/benchmark-record.contracts.json` — 3 schema-decidable cases (valid record; rejected approval claim via `comparison_only: false`; rejected unbound baseline variant); catalog-registered.
- `tests/vnext/benchmark-comparison.test.mjs` — 12 tests covering every S13 checkbox.
- READMEs (`core/contracts/README.md`, `evals/README.md`), `package.json` (`eval:benchmark-comparison`), `evals/catalog.json`.

## Slice checkbox mapping

| Checkbox | Evidence |
| --- | --- |
| Benchmark-Aufgabensatz (statisch + dynamisch) | `evals/benchmark/comparison/tasks.json`, loader fail-closed tests |
| Single-Executor-Baseline gefahren | `runVariant` static; baseline totals in record |
| Policy-gebundene Multi-Executor-Variante gefahren | `runVariant` dynamic via real `buildComposition` (`composition_ref` on the composed task) |
| Token/Kosten/Laufzeit/Interventionen/Verifikation/Artefaktqualität gemessen | per-task + totals in the record; acceptance-criteria evaluation tests |
| Context-Isolation geprüft | per-worker unique harness contexts + payload separation; fail-closed `CONTEXT_ISOLATION_VIOLATED` |
| Geerbte Authority-/Budget-Grenzen geprüft | `checkAuthorityBudgetInheritance` + tampered-cap test |
| Kontraproduktive Fälle dokumentiert | atomic tasks show coordination overhead; recorded in `selection_criteria.counterproductive_cases` |
| Auswahlkriterien festgehalten | `selection_criteria` partition with decomposable-only composition rule (`BENCHMARK_POLICY_VIOLATION` for atomic composition) |

## Boundary posture (spec 10.6 Grenzen)

- Decomposition is never chosen because multiple executors are available: an atomic task stays single-executor even in the candidate variant (fail-closed when violated).
- The record is a comparison basis only (`comparison_only` const `true`): no approval for broader autonomy, no qualification, no own success assertion.
- Baseline and candidate run the same fixed task set and eval family (semantic rule).
- Deterministic fixture metrics: the harness measures the recorded fixture profiles, not live model runs; it proves the measurement and selection machinery, not a production performance claim.

## Verification

- `node --test tests/vnext/*.test.mjs` — 395/395 PASS (includes the 12 new S13 tests).
- `npm run eval:maws-vnext` — ok:true (benchmark fixture included).
- `npm run eval:benchmark-comparison` — exit 0, record valid, selection criteria as documented above (parallel win on `bench_task_decomposable_audit`: latency 6400→3600 ms, cost 24→21, interventions 1→0; counterproductive overhead documented on both atomic tasks).
