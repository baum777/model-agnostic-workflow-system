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

## Pre-merge independent review (codex, round 1 on `980e3f9`)

3×P1 + 2×P2, all assessed as real and repaired on this head:

1. **P1 activation gate (R3):** the normal revision path (`rebind_executor` → `activateVersion`) could perform exactly the unevidenced context switch R3 rejects. Repaired: `workGraphStore.activateVersion` compares the superseded and activating graphs' binding contexts, asserts the transition via `assertSupersessionContextChange` (requiring the revision payload's evidenced `context_change`), writes it onto the supersession record, and refuses mixed-context graphs (`CONTEXT_BINDING_CONFLICT`). `rebind_executor` without `node_id` is graph-wide (one graph version binds one context). Revision engine threads `payload.context_change`.
2. **P1 executor gate completeness (R6):** `assertInvocationHarnessContext` validated only a semantic subset. Repaired: the gate now runs the FULL record validation (schema + semantic) via `validateHarnessContextRecord` with the module repo root — partial or unpinned records never reach an executor.
3. **P1 WorkUnit binding requirement:** `harness_context_ref` is now schema-REQUIRED on WorkUnits (creation-time enforcement via the work-unit store), `planAndBind` refuses bindings whose context reference differs from the WorkUnit's (engine passes `workUnits`), and decomposition children inherit the parent's context ref (no implicit child context change).
4. **P2 validator exactness:** the validator now rejects graphs whose nodes reference multiple context records and compares the single ref with strict equality (superstring refs rejected).
5. **P2 versioned pin:** `authority_surface.contract_ref` is pattern-bound to `^unitera-os/…` and `contract_version` to a strict three-part numeric version — floating pins fail closed.

Regression tests for all five repairs are in `tests/vnext/harness-context.test.mjs` (27 tests total).

## Pre-merge independent review (codex, round 2 on `fa0745b`)

3×P1, all assessed as real and repaired on this head:

1. **P1 mixed initial graphs:** the WorkUnit anchor check compared only the context ref, and initial registration never routed through the supersession gate. Repaired: `bindGraph` now enforces ONE uniform `(harness_context, harness_context_ref)` pair across all nodes before any registration (v1 graphs included); mixed pairs fail closed.
2. **P1 WorkUnit consistency on context rebinds:** the revision path could rewrite bindings onto a context whose immutable WorkUnits still declare the old one. Repaired: the revision engine now refuses ANY context-changing revision (`CONTEXT_BINDING_CONFLICT`) — a context switch is a bound plan change that re-anchors WorkUnits through a new plan; supersession records keep representing evidenced transitions on the read side (store activation gate + schema), while the live revision path fails closed.
3. **P1 rejected-candidate poisoning:** a candidate rejected during activation stayed registered, so `GRAPH_VERSION_EXISTS` blocked every later revision. Repaired: registration+activation are atomic from the caller's perspective — `revision-engine` discards the rejected candidate (`discardCandidateVersion`, guarded against ever discarding an active version) and the version slot stays usable.

Regression tests for all three repairs are in `tests/vnext/harness-context.test.mjs` (64 tests total; the round-1 evidenced-switch test was rewritten to the store-level activation gate it actually exercises).

## Pre-merge independent review (codex, round 3 on `aaf9ef4`)

1×P1 + 2×P2, all assessed as real and repaired on this head:

1. **P1 pair-level activation gate:** `bindingContexts` reduced bindings to the enum value, so a reference-only change (same context, different `harness_context_ref`) could activate unevidenced. Repaired: the store now compares full `context|ref` PAIRS (`bindingContextPairs`), and `assertSupersessionContextChange` moved to pair level — any transition (context value change OR reference re-anchoring) requires an evidenced `context_change` record; identical pairs reject a declared change.
2. **P2 run binding:** the engine now refuses a schema-valid record whose `run_ref` names a different run, or whose `plan_graph_ref` does not name this run's graph (`CONTEXT_BINDING_CONFLICT`); no cross-run record reuse.
3. **P2 map resolution exactness:** `resolveHarnessContext`'s map branch now returns an entry only when `entry.context_id` matches the requested ref, matching the array branch's exact-ID lookup.

New regression tests: reference-only re-anchoring requires evidence; cross-run record refusal; all spec-mutating tests re-bind the context record to the re-keyed run. 382/382 PASS.

## Pre-merge independent review (codex, round 4 on `be30ea1`)

3×P1, all assessed as real and repaired on this head:

1. **P1 mutable bound context:** the engine retained the caller-owned record object, so a mutating executor implementation could corrupt later nodes and the artifact. Repaired: the engine clone + deep-freezes the validated record before retention or dispatch.
2. **P1 optional workUnits at the binding gate:** `planAndBind` silently skipped every WorkUnit/context comparison when `workUnits` was omitted. Repaired: the WorkUnit collection is REQUIRED and every candidate node's work unit must resolve, carry the ref, and match the binding pair.
3. **P1 add_node revisions without WorkUnit resolution:** `submit` now requires the workUnits collection too and applies the same reference check to EVERY candidate node (including newly added ones) before registration; regression test with an add_node whose WorkUnit is anchored elsewhere.

383/383 PASS.

## Pre-merge independent review (codex, round 5 on `c751cb3`)

1×P1, real, repaired on this head: a uniform FALSE value (every node claiming a different context value under the referenced record's id) passed the ref-only comparison. Repaired: `planAndBind` now requires the VALIDATED harness-context record and compares both the record id AND the context value of every binding against it (plus every work unit's ref). Regression test with the uniform-false-value graph included; the round-2 mixed-pair scenario is now caught earlier with the precise `CONTEXT_BINDING_CONFLICT` code (bindGraph's uniform-pair gate remains as defense in depth for direct callers). 384/384 PASS.

## Pre-merge independent review (codex, round 6 on `d727595`)

2×P1 + 1×P2, all assessed as real and repaired on this head:

1. **P1 direct-activation gate:** a repeated `planAndBind` under an already-active graph id registered with `activate: true` and bypassed the supersession gate entirely. Repaired: noninitial DIRECT registrations now route through the same evidenced gate — atomically (the candidate is registered, activation-gated, and discarded again on rejection, so the version slot stays usable); an evidenced direct transition lands the `context_change` record.
2. **P1 buildNewVersion substitution:** a callback-supplied graph could contain nodes that were never WorkUnit-validated. Repaired: the WorkUnit/context resolution check is extracted and RE-RUN against the callback-returned graph's nodes before registration.
3. **P2 record validation at the planner:** `planAndBind` now runs `validateHarnessContextRecord` on the supplied record itself — a direct caller cannot bind against an incomplete or unpinned record.

385/385 PASS.

## Pre-merge independent review (codex, round 7 on `d5ba3a5`)

2×P1 + 1×P2, all assessed as real and repaired on this head:

1. **P1 callback substitution at pair level:** the post-callback check compared only WorkUnit refs. Repaired: the callback-returned graph is additionally re-checked with the SAME pair-level context-delta rule as the candidate — a substituted uniform false-value graph is refused even when the request carries an evidenced context_change.
2. **P1 qualification revalidation on rebinds:** a rebind that REPLACES a qualification now requires qualification + qualifiedFingerprint inputs proving the new qualification was earned under the graph's bound context (`assertQualificationContextBinding`); absent inputs fail closed; unchanged qualification refs are not re-claimed.
3. **P2 mutable planner context:** the planner clone + deep-freezes the validated record before `routingForNode` runs — a routing callback cannot mutate the binding source of truth.

386/386 PASS.

## Pre-merge independent review (codex, round 8 on `b4d63dc`)

1×P1, real, repaired on this head: an `add_node` revision claims a qualification for the first time and had no previous binding to compare against, so the qualification-context check was skipped for it. Repaired: the check now applies to every node whose qualification is not demonstrably unchanged (new nodes included) — absent qualification/fingerprint inputs fail closed with `CONTEXT_BINDING_MISSING`; the error message distinguishes a new node from a replaced qualification ref. Regression test included. 386/386 PASS.

## Verification

- `node --test tests/vnext/*.test.mjs` — 386/386 PASS (includes the S11 tests across all eight repair rounds and all coordinated amendments).
- `npm run eval:maws-vnext` — ok:true (now includes `harness-context.contracts.json`).
- `npm run validate-harness-context` — CLI smoke: valid record exit 0, unknown-vocabulary record exit 1.
- Full engine path: `runtime/cli/runtime-run.mjs --spec runtime/cli/specs/reference-audit-v1.json` completes COMPLETED with the bound dev context (CLI test asserts this continuously).
- Pre-merge independent review: codex review requested on the open PR; findings disposition recorded in the PR thread before merge.

## Out of scope / boundary

- `runtime/qualification/*` unchanged: the `FINGERPRINT_COMPONENT_KEYS` amendment (effective instruction digest as a qualification component) is S7; S11 enforces qualification-vs-context coupling at the binding-scope comparison level only.
- No unitera-os change; the authority surface is consumed as a reference-only pin.
- The specification remains PROPOSED; nothing here adopts it or grants runtime authority.
