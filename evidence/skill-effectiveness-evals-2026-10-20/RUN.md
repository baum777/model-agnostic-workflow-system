# S5 Behavioral Evaluation — Implementation Run Record

- Run: S5-BEHAVIORAL-EVALUATION-2026-10-20
- Spec binding: MAWS-SII-TARGET-SPEC-001 v0.2.0 (PROPOSED), slice S5, plus the dependency matrix in `docs/proposals/skill-intelligence-reconciliation-map-2026-10-20.md` §3 (S2 wave 1+2 and S3 closed → S5 unblocked).
- Source of authority: the owner run directive of 2026-10-20 ("S5 als ersten Implementierungsrun durchführen. S11 kann unabhängig vorbereitet werden."), bounded to this slice. The spec remains PROPOSED; this run materializes the slice and does not adopt the specification.
- Implementation commit: `8b207585436bf85b1719cee7a061ca99c5671bef` (unsigned — the agent-side gpg pinentry was unreachable in this headless run; MAWS carries no signed-commit requirement; disclosed in the commit message, this record, and the pull request).

## Objective

Improvements to instruction/skill behavior can be proven or rejected with reproducible evidence (slice S5 DoD): a canonical baseline/candidate eval record contract, an isolated-run runner, a positive/negative/security/parity corpus, and executable gates wired into npm scripts.

## Scope (what changed)

| Surface | Change |
| --- | --- |
| `core/contracts/behavioral-eval.schema.json` | New canonical contract (BehavioralEvalRecord 1.0.0). `model_run.isolated` is a schema constant `true`; the isolation envelope carries `allowed_effects: []`, `inherited_qualification: none`, and bounded workspace/network postures. |
| `scripts/tools/validate-behavioral-eval.mjs` | Shape validator plus fail-closed semantic invariants R1–R5: security regressions force verdict `BLOCKED` and gate `BLOCK`; proven improvement requires fully passed blocking families, non-negative deltas, zero regressions; family counts must add up; unexplained `BLOCKED` rejected. |
| `scripts/tools/run-skill-effectiveness-evals.mjs` | Eval runner. `recorded_replay` (default, deterministic, CI-safe) evaluates recorded transcripts bound by digest; `live_model` invokes a `defineExecutor`-built executor under a fail-closed isolation envelope and refuses (`LIVE_MODEL_EXECUTOR_UNAVAILABLE`) without `--live` plus `--executor-module`. Live refusals are signaled via an inline `decision` payload (`behavioral_outcome: BLOCKED`); routing via an inline `routing` payload. Records are sealed with a deterministic `content_digest` (canonical JSON, creation time excluded). |
| `evals/skill-effectiveness/` | Corpus `corpus.json` + `baseline/cases.json`, `candidates/cases.json`, `negative-cases/cases.json` (blocking), `security-cases.json` (blocking, expected refusals), `model-parity/cases.json` (non-blocking in this slice; full parity is S10/S13 scope). The shipped baseline carries one intended behavioral gap (`se_pos_003`); the candidate fixes it, so the shipped pipeline proves `IMPROVEMENT_PROVEN`. |
| `evals/fixtures/maws-vnext/behavioral-eval.contracts.json` + `evals/catalog.json` | Schema-decidable fixture cases in the maws-vnext format, catalog-registered (covered by `eval:maws-vnext` and `validate-maws-vnext`). Semantic-only violations stay in unit tests, following the instruction-audit-finding precedent. |
| `package.json` | `eval:skill-effectiveness` (gate: exit 0 only for `IMPROVEMENT_PROVEN`; `BLOCKED`/`IMPROVEMENT_REJECTED` exit 2) and `validate-behavioral-eval`. |
| `core/contracts/README.md`, `evals/README.md` | Canonical registration of the new contract and eval family, including the evidence-not-authority posture. |
| `tests/vnext/behavioral-eval.test.mjs` (7 tests), `tests/vnext/run-skill-effectiveness.test.mjs` (8 tests) | Fixture labels, R1–R5 behavior, digest determinism and content sensitivity, shipped-corpus baseline/candidate pipeline, security-regression fail-closed path, comparison rejection path, live-mode refusal + isolation envelope (`allowed_effects: []` asserted on every invocation), transcript evaluation semantics, corpus path-escape rejection. |

## Verification (executed)

- `npm run test:vnext` — 334/334 pass, 0 fail (15 new S5 tests included).
- `node --test tests/vnext/behavioral-eval.test.mjs` — 7/7; `node --test tests/vnext/run-skill-effectiveness.test.mjs` — 8/8.
- `npm run validate-behavioral-eval` — 6 fixture cases, 0 unexpected results.
- `npm run eval:skill-effectiveness` — exit 0, final verdict `IMPROVEMENT_PROVEN`; sealed records at `evidence/skill-effectiveness-evals-2026-10-20/eval-record-bev-skill-effectiveness-{baseline,candidate}.json`.
- `npm run validate`, `validate-neutral`, `validate-maws-vnext`, `validate-secrets`, `scan-secrets` — PASS.
- Eval kinds obs, pbc, wmc, mahp, rgc, tsc, secret-boundary, skill-routing, workflow-routing, workflow-evidence, provider-export-alignment, semantic-layout, maws-vnext — all PASS.
- `npm run eval` (full suite) fails in this environment at the render/a11y kinds with Playwright Chromium ENOENT. The identical failure exists on the untouched primary checkout at `d6a8fdd0563500d49dfb96b2068d8a7cd737bc47` — pre-existing environment limitation, not a regression of this change. Chrome-dependent kinds are not claimed as verified by this run.

## Non-goals honored

No live provider credentials are required or used in CI; no second registry; no skill promotion; no runtime activation; no authority change. The eval record is analysis output.

## Registry disposition

`registry-disposition.json` in this directory: `REQUIRED_BUT_BLOCKED`, `material_change: true`, `registry_relevant_change: true`, affected record `CONTRACT_RECORD:core/contracts/behavioral-eval.schema.json`, `registry_commit_sha: null`. The Registry write (CONTRACT_RECORD projection + run change registration) follows this repository's merge as a separate Unitera-registry change; this disposition is rebound to `UPDATED` with the registry merge SHA in the follow-up owner evidence update.

## Next gate

- Registry write for the new CONTRACT_RECORD + change registration, then the rebind to `UPDATED`.
- S6 (Adaptive Context Assembly) and S12 (Model-Adaptive Executor Profiles) become unblocked only after this slice is merged on the owner default branch and registered/mapped (dependency matrix §3).
