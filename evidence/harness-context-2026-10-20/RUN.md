# S11 Run Record — Harness Context Separation (2026-10-20)

- Spec binding: `MAWS-SII-TARGET-SPEC-001` v0.2.0 (PROPOSED), slice S11 + section 4.3.
- Source of authority: bounded owner run directive of 2026-10-20 ("run S11 implementierung und closure S7, S13 und S8"). This run materializes the slice; it does not adopt the specification and grants no runtime authority.
- Preparation basis: `docs/proposals/harness-context-separation-implementation-plan-2026-10-20.md` (PREPARATION ONLY record, merged with the S5 run).
- Implementation branch: `s11/harness-context-20261020`, cut from MAWS `origin/main` = `9daab77` (post PR #41).

## Owner open questions resolved for this run (disclosed decisions)

The preparation document (section 6) listed four owner decisions as implementation gates. The owner's directive to run the implementation under the bounded run directive is read as authorization to proceed on the preparation document's own recommendations, recorded here as disclosed run decisions — not as canonical adoption:

1. **Fail-closed scope of the WorkUnit amendment** — recommendation taken: all new WorkUnits require the context binding. Implementation form: `harness_context_ref` is a typed schema field on the WorkUnit (kept additive so historical instances stay schema-valid, per the preparation note that validation applies at creation/binding time) and is enforced fail-closed at the single binding choke point: the run engine refuses to create a WorkUnit without a validated run-level context record, `assertWorkUnitContextBinding` refuses executor binding without the ref, and the executor invocation gate refuses any invocation without a bound context (`CONTEXT_BINDING_MISSING`). R6 has no fallback path in code or tests.
2. **Context vocabulary carrier** — recommendation taken: strictly two-valued in v1 (`development_harness` | `unitera_product`, closed enum). Sub-scoping is deferred to a later contract version.
3. **Evidence form for context switches** — recommendation taken: the graph supersession surface carries switch evidence (`superseded_by.context_change` on the BoundExecutionGraph and `context_change` on the GraphSupersessionRecord, both with required `evidence_ref`). No new record surface.
4. **unitera-os pointer form** — recommendation taken: versioned pin (`authority_surface.repository` const `unitera-os`, `contract_ref`, `contract_version`), reference-only.

## What was implemented

New:

- `core/contracts/harness-context.schema.json` — HarnessContext 1.0.0: closed two-value vocabulary, `authority_grant` const `none`, reference-only versioned `authority_surface` for the product context, schema-level dev/product authority-surface coupling (if/then).
- `runtime/harness-context/context-binding.mjs` — R1–R6 enforcement: `validateHarnessContextRecord` (semantic codes before schema: `CONTEXT_VOCABULARY_UNKNOWN`, `CONTEXT_BINDING_CONFLICT`, `PRODUCT_AUTHORITY_FROM_DEV_CONTEXT`, `CONTEXT_BINDING_MISSING`), `resolveHarnessContext`, `contextOfRuntimeHarness` (prefix convention `<context>[/<detail>]`), `assertQualificationContextBinding` (R4), `assertWorkUnitContextBinding`, `assertNoProductAuthorityFromDevContext` (R2, ref namespace `unitera-os/`), `assertInvocationHarnessContext` (executor-side gate), `assertSupersessionContextChange` (R3, `CONTEXT_SWITCH_UNEVIDENCED`), `developmentProbeHarnessContext` (canonical dev record for in-process probes).
- `scripts/tools/validate-harness-context.mjs` — validator surface (`semanticContextIssues`), isMain-guarded CLI (`npm run validate-harness-context`).
- `evals/fixtures/maws-vnext/harness-context.contracts.json` — 9 schema-decidable cases (positive dev/product, vocabulary, authority grant, dev-with-surface, product-without-surface, evidenced context-change supersession, unevidenced switch, graph-level context_change); catalog-registered.
- `tests/vnext/harness-context.test.mjs` — 21 tests, one group per rule R1–R6 plus engine-level positives/negatives.

Amended:

- `core/contracts/work-unit.schema.json` — typed optional `harness_context_ref` + binding-time enforcement description.
- `core/contracts/bound-execution-graph.schema.json` — executor_binding now requires `harness_context` + `harness_context_ref`; `superseded_by.context_change` (evidence-backed transition).
- `core/contracts/graph-supersession-record.schema.json` — optional `context_change` with required `evidence_ref`.
- `runtime/orchestrator/run-engine.mjs` — required `harnessContext` option (validated before anything binds), WorkUnit carries the ref, routing bindings carry context fields, R4 assertion on every routing decision against the QUALIFIED fingerprint snapshot, invocation carries the bound record, `harness-context.json` artifact.
- `runtime/cli/runtime-run.mjs` — run specs must carry `harness_context` (fail closed `CONTEXT_BINDING_MISSING` otherwise).
- `runtime/executors/executor-base.mjs` — invocation gate: missing/contradictory context never reaches an executor.
- Invocation builders `runtime/auth/codex-chatgpt-auth.mjs`, `runtime/activation/live-activation.mjs`, `scripts/tools/run-skill-effectiveness-evals.mjs` — canonical dev probe context.
- Coordinated data amendments: `runtime/cli/specs/reference-audit-v1.json` (run-level dev context record; qualification + qualified-snapshot fingerprints context-scoped to `development_harness/in_process_fixture/1`), `evals/fixtures/maws-vnext/planning.contracts.json` (bound-graph bindings carry the context fields; +2 S11 negative cases).
- READMEs (`core/contracts/README.md`, `evals/README.md`), `package.json` (`validate-harness-context`), `evals/catalog.json`.

## Rule-to-evidence map

| Rule | Enforcement | Proof |
| --- | --- | --- |
| R1 routing/binding size, never authority | closed enum + `authority_grant` const `none` (schema + semantic) | fixture `harness-context-rejects-unknown-vocabulary` / `-rejects-authority-grant`; tests R1×2 |
| R2 dev run derives no product authority | dev records reject `authority_surface` (schema + semantic `PRODUCT_AUTHORITY_FROM_DEV_CONTEXT`); `unitera-os/` authority refs rejected under dev at binding level and engine gate | R2 headline tests (record + engine), fixture `harness-context-rejects-dev-with-authority-surface` |
| R3 switch = evidenced plan change | supersession `context_change` with required `evidence_ref`; `assertSupersessionContextChange` (`CONTEXT_SWITCH_UNEVIDENCED`, endpoint mismatches conflict) | R3 tests ×3, fixtures `supersession-context-change-valid` / `-rejects-missing-evidence`, graph-level fixture |
| R4 no cross-context qualification transfer | `assertQualificationContextBinding` on every routing decision vs the qualified snapshot; non-declaring `runtime_harness` is ambiguous and unroutable | R4 tests ×3 incl. engine-level, fingerprint prefix convention tests |
| R5 product effects stay execution-control-owned; reference-only pin | product record requires versioned `unitera-os` `authority_surface`; module mints/caches no authority | R5 test, fixture `harness-context-valid-product` |
| R6 missing/contradictory binds no executor | engine pre-gate, WorkUnit binding assert, executor invocation gate; no fallback anywhere | R6 tests ×4 incl. engine-level null-context refusal |

## Verification

- `node --test tests/vnext/*.test.mjs` — 372/372 PASS (includes the new 21 S11 tests and all coordinated amendments).
- `npm run eval:maws-vnext` — ok:true (now includes `harness-context.contracts.json`).
- `npm run validate-harness-context` — CLI smoke: valid record exit 0, unknown-vocabulary record exit 1.
- Full engine path: `runtime/cli/runtime-run.mjs --spec runtime/cli/specs/reference-audit-v1.json` completes COMPLETED with the bound dev context (CLI test asserts this continuously).
- Pre-merge independent review: codex review requested on the open PR; findings disposition recorded in the PR thread before merge.

## Out of scope / boundary

- `runtime/qualification/*` unchanged: the `FINGERPRINT_COMPONENT_KEYS` amendment (effective instruction digest as a qualification component) is S7; S11 enforces qualification-vs-context coupling at the binding-scope comparison level only.
- No unitera-os change; the authority surface is consumed as a reference-only pin.
- The specification remains PROPOSED; nothing here adopts it or grants runtime authority.
