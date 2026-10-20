# S6 Adaptive Context Assembly — Implementation Run Record

- Run: S6-INSTRUCTION-BUNDLES-2026-10-20
- Spec binding: MAWS-SII-TARGET-SPEC-001 v0.2.0 (PROPOSED), slice S6 plus section 7 (Adaptive Context Assembly, Instruction Bundle, Context Ownership and Non-Duplication); dependency matrix in `docs/proposals/skill-intelligence-reconciliation-map-2026-10-20.md` §3 (S5 merged/registered/mapped + coreos context compiler available → S6 unblocked at run start).
- Source of authority: the owner run directive of 2026-10-20 ("starte s6"), bounded to this slice. The spec remains PROPOSED; this run materializes the slice and does not adopt the specification.
- Implementation commit: see the disposition (`implementation_commit_sha`); commits are unsigned (same disclosed cause as the S5 wave; MAWS carries no signed-commit requirement).

## Objective

Kontext wird reduziert, ohne benötigte Evidence oder verbindliche Regeln zu verlieren (slice S6 DoD): the Effective Instruction Bundle as a reproducible, digest-bound composition with canonical ordering, instruction-class binding over the S2 inventory, and version-bound references to the coreos-owned compiled context bindings.

## Scope (what changed)

| Surface | Change |
| --- | --- |
| `core/contracts/instruction-bundle.schema.json` | New canonical contract (InstructionBundle 1.0.0, spec 7.4 shape as JSON schema): ordered `selected_sources` with `binding_class` + `assembly_slot` + `source_digest`, `context_binding_refs` as version-bound references to coreos compilations (const `coreos-context-compiler`, `contract_version` const 1.0.0), `conflicts` vocabulary (`missing_source`, `digest_mismatch`, `contradictory_source`, `missing_required_context`), `eligible_for_execution` with the schema-level conflict/eligibility coupling, `effective_instruction_digest`, provenance with the inventory snapshot reference. |
| `runtime/context/instruction-bundle-assembler.mjs` | The assembler: always-on binding core from the S2 inventory (every canonical/canonical_contract source, spec 7.3 rule 1+7), policy-driven selective resolution for overlays/skills/references/evidence, canonical assembly order (core → workflow_contract → overlay → skills → references → evidence, spec 7.2), sha256 source digests, `effective_instruction_digest` over contents-via-digests plus defined order, visible-and-blocking conflicts (spec 7.5: never silently resolved; a missing required compiled context blocks the execution instead of proceeding with a narrower bundle), reference-only context bindings (no second compiler, no duplication). |
| `scripts/tools/validate-instruction-bundle.mjs` | Shape validator plus fail-closed semantic invariants B1–B5: digest recomputability from the bundle's own ordered fields (B1), canonical order without duplicate refs (B2), binding-source retention for execution-eligible bundles (B3), instruction_classes count consistency (B4), reference-only context bindings (B5). |
| `evals/context-assembly/cases.json` + `scripts/tools/run-context-assembly-evals.mjs` | The Full-Context-Baseline-vs-Candidate check (slice checkbox 5) over the real repository instruction tree: full baseline (all inventory skills) vs reduced candidates, proving P1 strict reduction, P2 retention of every canonical binding source with identical digests, P3 conflict-free eligibility with fail-closed `missing_required_context` blocking, P4 digest determinism and selection sensitivity. npm gate `eval:context-assembly` (exit 2 on any violated property). Behavioral equivalence of a reduction remains the S5 behavioral gate's job; this eval proves the structural assembly properties. |
| `evals/fixtures/maws-vnext/instruction-bundle.contracts.json` + `evals/catalog.json` | Schema-decidable fixture cases (maws-vnext format, catalog-registered, covered by `eval:maws-vnext` and `validate-maws-vnext`). Semantic-only violations stay in unit tests, following the established precedent. |
| `package.json` | `eval:context-assembly` and `validate-instruction-bundle`. |
| `core/contracts/README.md`, `evals/README.md` | Canonical registration of the new contract and eval family; the stale S5 isolation wording (pre-R6) is corrected in passing. |
| `tests/vnext/instruction-bundle.test.mjs` (8 tests), `tests/vnext/context-assembly.test.mjs` (1 test) | Fixture labels, B1–B5 behavior, binding-core retention, visible conflicts, fail-closed required-context blocking, escape rejection, digest determinism/content-sensitivity, and the eval's P1–P4 over the real tree. |

## Non-goals honored (spec 7.5)

No second context compiler and no second canonical context manifest; the bundle references the coreos context binding (compiler const + contract version + compilation digest), it never embeds context payloads. The qualification fingerprint component key set stays closed — the Effective-Instruction-Digest-in-fingerprint wiring is slice S7's coordinated amendment. No runtime activation, no authority change; the bundle is context and behavior input, never a permission token.

## Verification (executed)

- `npm run test:vnext` — 347/347 pass, 0 fail (9 new S6 tests included).
- `node --test tests/vnext/instruction-bundle.test.mjs` — 8/8; `node --test tests/vnext/context-assembly.test.mjs` — 1/1.
- `npm run eval:context-assembly` — exit 0: "reduction, retention, eligibility and determinism proven".
- `npm run validate-instruction-bundle` — 6 fixture cases, 0 unexpected results.
- `npm run validate` / `validate-neutral` / `validate-maws-vnext` / `validate-secrets` / `scan-secrets` — PASS.
- `npm run eval:maws-vnext` with the new catalog-registered fixture — PASS. The Chrome-dependent render/a11y kinds remain unclaimed (pre-existing environmental Chromium ENOENT, unchanged from the S5 wave record).

## Registry disposition

`registry-disposition.json` in this directory: `REQUIRED_BUT_BLOCKED` initially, affected record `CONTRACT_RECORD:core/contracts/instruction-bundle.schema.json`, `registry_commit_sha: null`. The Registry write (CONTRACT_RECORD projection + run change registration) follows this repository's merge; this disposition is rebound to `UPDATED` with the registry merge SHA in the follow-up owner evidence update.

## Pre-merge codex review round

The codex connector reviewed PR #39 before merge (triggered via `@codex review`) and raised three findings, all confirmed real and repaired in this publication:

- **F1 (P1) B3 failed open for externally supplied bundles** — the structural check only required one canonical and one canonical_contract source, so a hand-edited bundle could drop binding rules and stay "eligible". The contract now carries `provenance.source_revision`, and B3 has an inventory-verified mode: it rebuilds the S2 instruction inventory at that revision and requires every canonical binding source to be present with its matching digest and binding class. The shipped gate (`eval:context-assembly`) runs in the verified mode; the standalone validator documents the structural fallback (synthetic bundles without a rebuildable tree) as its explicit boundary, and a regression test proves a dropped binding source is caught in verified mode.
- **F2 (P2) B2 ignored ref order inside a slot** — canonical order is (slot, ref); the check now compares each source with its predecessor by slot rank and then ref, so swapped same-slot entries (even with a recomputed digest) are rejected.
- **F3 (P2) dot-segment selections duplicated sources** — selection refs are normalized (posix) before the dedup lookup, so `docs/../AGENTS.md` and `./core/skills/alpha/SKILL.md` hit the same source instead of adding a duplicate `workspace_selected` entry.

Found and fixed during the same round: the assembler's sort used `localeCompare` while B2 compares code-unit order — the canonical order is now code-unit (byte) order in both places, deterministic and locale-independent.

Verification after the repairs: `test:vnext` 350/350 (3 new codex-repair regression tests), `eval:context-assembly` exit 0, `validate-instruction-bundle` 6 fixture cases clean; disposition validator PASS.

## Next gate

- S7 (Qualification Integration) becomes unblocked once S6 is merged/registered/mapped AND S11 is implemented (dependency matrix §3); S7 owns the coordinated qualification-fingerprint amendment binding the `effective_instruction_digest`.
- S13 additionally waits on S11's context isolation.
