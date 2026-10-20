# S11 Harness Context Separation — Implementation Preparation

- Status: PREPARATION ONLY — no implementation, no adoption, no runtime authority.
- Spec binding: MAWS-SII-TARGET-SPEC-001 v0.2.0 (PROPOSED), slice S11 plus section 4.3 (Harness Contexts).
- Dependency check at preparation time: S2 wave 1 + wave 2 merged, registered and mapped (authority-class-aware instruction set); the tenant/assignment authority in `unitera-os` is available (effective-autonomy evaluation over the trusted row with RLS + grants, migration 0060, merged `b4484afd`, registered). Per reconciliation map §3, **S11 is unblocked**.
- Source of authority: the owner run directive of 2026-10-20 ("S11 kann unabhängig vorbereitet werden."), bounded to preparation. This document plans the bounded implementation run; it does not start it and does not adopt the specification.

## 1. Objective (S11 DoD, verbatim intent)

> Ein Development-Harness-Run kann keine Product-Runtime-Authority erzeugen; ein Kontextwechsel ist ein gebundener Planwechsel mit eigener Evidenz.

The slice makes the harness context (Development Harness vs UNITERA Product Harness, spec 4.3) a machine-readable routing and binding dimension that is carried by WorkUnits and bound execution graphs, coupled to executor bindings and qualification, fail-closed on missing or conflicting binding, and inert as an authority source.

## 2. Target Semantics (from spec 4.3, restated as testable rules)

| # | Rule | Enforcement point |
| --- | --- | --- |
| R1 | The harness context is a routing and binding size, never an authority source. | Schema vocabulary is closed to two declared contexts; no field of the context record grants capability. |
| R2 | A Development-Harness-Run derives no Product-Runtime-Authority from an instruction, skill, model capability, or provider configuration. | Negative-case gate: a product-authority claim bound to a development context run fails closed. |
| R3 | A context switch is a bound plan change with its own evidence, not an implicit fallback. | Graph supersession carries the context change as an explicit, evidenced transition; no default-context fallback exists. |
| R4 | Executor bindings carry the harness context; a qualification earned in one context is not automatically valid in the other. | Executor binding records and qualification checks compare the bound context as part of the binding scope. |
| R5 | Product effects stay bound to tenant, membership, and execution-control decisions regardless of harness context. | The context record references — but never substitutes — the tenant/assignment authority surface in `unitera-os`; product-effect gating remains execution-control-owned. |
| R6 | A run whose context binding is missing or contradictory binds no executor. | Binding validation is a pre-execution gate; missing/contradictory context yields a fail-closed block, not a default. |

Non-goal guardrails: S11 must NOT extend the qualification fingerprint component key set (`FINGERPRINT_COMPONENT_KEYS` is closed and fails closed on unexpected keys — that coordinated amendment is slice S7), must not introduce a second execution-control path, and must not bind the context to authority semantics beyond routing/binding.

## 3. File-by-File Plan

New paths verified free against `origin/main` = `53d70771ee86ae6401bb22d5aed1998ab4218865` (collision check executed for this document; re-run at implementation time):

| Path | Create/Amend | Content |
| --- | --- | --- |
| `core/contracts/harness-context.schema.json` | create | Canonical context-binding record: closed context vocabulary (`development_harness`, `unitera_product`), binding scope refs (run_ref, plan/graph ref), evidence ref for context switches, tenant/assignment authority pointer for the product context (reference-only), explicit `authority_grant: none` posture field. |
| `core/contracts/work-unit.schema.json` | amend | New optional-but-gated field `harness_context_ref`; when present it must resolve to a valid context record. Fail-closed decision to confirm with owner (section 6): required for all new WorkUnits vs required only for product-effect WorkUnits. |
| `core/contracts/bound-execution-graph.schema.json` | amend | Node-level context binding plus a context-change transition record on supersession (evidence-backed, per R3). |
| `runtime/harness-context/context-binding.mjs` | create | Binding loader/validator: resolves context records, enforces R1–R6, exports fail-closed error codes (`CONTEXT_BINDING_MISSING`, `CONTEXT_BINDING_CONFLICT`, `CONTEXT_VOCABULARY_UNKNOWN`, `CONTEXT_SWITCH_UNEVIDENCED`, `PRODUCT_AUTHORITY_FROM_DEV_CONTEXT`). |
| `runtime/executors/executor-base.mjs` | amend | Invocation contract: `authority_envelope` gains the bound context reference; executors refuse invocations whose context binding is absent/contradictory (extends the existing fail-closed invocation shape). |
| `runtime/qualification/*` | no change in S11 | Qualification-vs-context coupling is expressed at the binding-scope comparison level (R4) without extending `FINGERPRINT_COMPONENT_KEYS`; the fingerprint amendment is S7. Boundary documented in the schema description. |
| `scripts/tools/validate-harness-context.mjs` | create | CLI validator (fixture + explicit records), mirroring `validate-behavioral-eval.mjs`. |
| `evals/fixtures/maws-vnext/harness-context.contracts.json` + catalog entry | create | Schema-decidable positive/negative cases; semantic-only cases in unit tests. |
| `tests/vnext/harness-context.test.mjs` | create | R1–R6 tests, including the negative case: a development-harness run presenting a product-authority claim fails closed; a context switch without evidence fails closed; a missing binding binds no executor. |
| `core/contracts/README.md`, `evals/README.md`, this plan's run record | amend | Canonical registration and evidence. |

## 4. Integration Boundaries

- `unitera-os` authority (tenant/assignment, effective autonomy) stays the only product-authority source; the MAWS context record carries a reference pointer and re-validates against it at binding time, it never caches or mints authority (R5). Cross-repo sequencing: MAWS binds; `unitera-os` contract is consumed read-only; no unitera-os change is required for S11 itself.
- Execution-control binding (Product effects) stays owned by the existing execution-intake/execution-control chain; S11 adds the context dimension to its input validation, not a new gate.
- Registry projection: one `CONTRACT_RECORD` for the new schema plus a run change registration, following the S5 two-phase disposition pattern (`REQUIRED_BUT_BLOCKED` → rebind `UPDATED` after the registry write).
- Atlas: one superseding/cumulative claim pinned to the merge commit.

## 5. Test and Eval Plan

1. Schema fixture: positive/negative labeled cases, catalog-registered (`eval:maws-vnext`).
2. Unit tests per rule R1–R6 with explicit negative cases; the R2 negative case is the slice's headline proof (development run + product-authority claim → fail closed).
3. Runner-level test: WorkUnit/graph validation refuses executor binding on missing context (extends the existing runtime-validate surface).
4. Eval posture: context separation is a blocking property; no advisory softening.

## 6. Open Questions for the Owner (blockers for the implementation run, not for this preparation)

1. **Fail-closed scope of the WorkUnit amendment:** require `harness_context_ref` on all new WorkUnits (strictest, invalidates nothing historical because the field would be new and validation applies at creation/binding time), or only on WorkUnits with product-effect intents? Recommendation: all new WorkUnits, because R6 has no clean partial form.
2. **Context vocabulary carrier:** should the development context be subdividable (e.g., repository-scoped development runs) in v1, or strictly two-valued? Recommendation: strictly two-valued in v1; sub-scoping is a later contract version.
3. **Evidence form for context switches:** accept the graph supersession record as the switch evidence carrier, or a dedicated switch record? Recommendation: supersession record (no new surface).
4. **`unitera-os` pointer form:** static service reference or versioned contract pin? Recommendation: versioned pin, consistent with the projection conventions.

## 7. Acceptance Criteria (mapping to the slice checkboxes)

- [ ] Harness-Kontext als gebundene Routing- und Binding-Größe modelliert → schema + vocabulary + R1 test.
- [ ] Kontextbindung im WorkUnit und im BoundExecutionGraph verankert → amendments + validation tests.
- [ ] Executor-Bindungen an den Harness-Kontext gekoppelt; keine kontextübergreifende Qualification-Übernahme → R4 tests at the binding-scope level (fingerprint extension deferred to S7, documented).
- [ ] Product-Runtime-Authority aus Development-Run als negativer Fall fail-closed → R2 headline test.
- [ ] Product-Effekte an Execution-Control-Entscheidungen gebunden → R5 boundary tests (no new gate).
- [ ] Fehlende/widersprüchliche Kontextbindung als Blocker → R6 fail-closed error codes, no fallback path in code or tests.
- DoD check: the negative-case suite proves both DoD sentences; the run record carries the evidence chain.

## 8. Estimated Scope

One bounded implementation run, comparable to S5: ~2 new files, 2 schema amendments, 1 executor-invocation amendment, validator + fixture + catalog + tests, evidence + disposition, then the registry/atlas projections. No unitera-os change.
