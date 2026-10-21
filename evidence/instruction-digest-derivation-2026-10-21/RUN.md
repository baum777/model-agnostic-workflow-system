# S7 Run Record — Runtime Instruction Digest Derivation (2026-10-21)

- Spec binding: `MAWS-SII-TARGET-SPEC-001` v0.2.0 (PROPOSED), slice S7 + sections 11.2/11.3.
- Directive: the scoped residual closure run of 2026-10-21 (S7/S8 residual obligations).
- Predecessor: `evidence/qualification-integration-2026-10-20/RUN.md` — that run closed the S7 slice but recorded the runtime bundle→fingerprint derivation as an **OPEN obligation**.

## What this run closes

The predecessor recorded, verbatim: *"The qualification fingerprint is not yet derived from the assembled instruction bundle at runtime (the run spec still carries the digest as spec-declared data, so a change in the real instruction bundle invalidates a qualification only when the declared digest is updated with it)."*

This run closes that obligation. The effective instruction digest is now **derived at run time** from the effective instruction bundle the run actually gets.

## Implementation

| Surface | Change |
| --- | --- |
| `runtime/qualification/instruction-binding.mjs` (new) | The derivation seam: assembles the effective instruction bundle with the **S6 assembler** over the live instruction tree, recomputes the digest from the bundle's own content and order, re-reads every selected source against the tree, and binds the **derived** digest into the qualification fingerprint (the fingerprint digest is recomputed with it). |
| `runtime/cli/runtime-run.mjs` | The run spec now carries `instruction_binding` (assembly inputs). The CLI derives the binding, binds it into every current fingerprint and passes the BOUND fingerprints to the eligibility gate. The new `instruction-binding.json` run artifact records the derived digest, the source snapshot, the verified source count and the declared per-executor digests — with `declared_digests_used_for_decisions: false`. |
| `runtime/cli/specs/reference-audit-v1.json` | The reference spec carries the assembly inputs and a **re-earned** qualification binding: the qualification snapshots now name the digest of the instruction state they were earned under. |
| `scripts/tools/requalify-run-spec.mjs` (new) | Re-qualification binding calculator: recomputes the instruction-digest binding of a run spec from the live tree. It grants no capability, qualifies no executor and changes no permission — the qualification decision stays with the qualification authority, and the result is a reviewed change like every other change to a committed spec. |
| `tests/vnext/instruction-binding.test.mjs` (new) | 16 tests, including the repository gate that fails when the instruction state moved without a re-qualification. |

## Rules enforced (all fail closed)

| Rule | Statement |
| --- | --- |
| D1 | The assembly inputs are mandatory. A run without an instruction binding has no effective instruction state and binds no executor (`INSTRUCTION_BINDING_MISSING`). |
| D2 | The assembled bundle must be internally consistent: its declared digest must equal the digest recomputed from its own content and order (`INSTRUCTION_BUNDLE_DIGEST_INCONSISTENT`). |
| D3 | Every selected source is re-read from the tree and compared to the digest the bundle binds (`INSTRUCTION_SOURCE_DIGEST_MISMATCH`, `INSTRUCTION_SOURCE_MISSING`, `INSTRUCTION_SOURCE_ESCAPES_ROOT`). A bundle that no longer describes the live tree cannot produce a qualification. |
| D4 | A qualification fingerprint must carry the component (`INSTRUCTION_DIGEST_MISSING` / `INSTRUCTION_DIGEST_INVALID`). The runtime binds the **derived** digest and recomputes the fingerprint digest; the declared value is recorded for traceability and never used for a decision. |

## Independence of the derived value

- The **source snapshot label** is content-addressed (`content:<sha256>`), not a caller-supplied revision: the runtime derives it from the declared instruction sources, so a caller cannot name a revision and thereby pin a stale state.
- The **qualified snapshots keep the digest they were earned under.** The current fingerprint is bound to the derived digest. A material instruction change therefore produces a `MATERIAL_FINGERPRINT_DRIFT` and the run is blocked until the qualification is re-earned.

## Independent review (exact head)

- Reviewer: local audit agent, tool-driven, with mutation probes (the codex review connector was quota-exhausted for this lane; **no human approval is claimed**).
- Verdict: **PASS_WITH_FINDINGS** on the reviewed head `bd95952`.
- The reviewer measured: 551 vnext tests, 21 tools tests, `npm run validate` / `validate-maws-vnext` / `eval:maws-vnext` clean, `ci-gate.mjs` → PASS CI Gate.

### Findings and repair

| Finding | Repair |
| --- | --- |
| **P2 (F1)** — the S7 runtime wiring was not test-bound: mutating `currentFingerprints: boundFingerprints` to the spec-declared fingerprints left the whole suite green. The reviewer demonstrated the behavioural difference end to end (a perturbed instruction tree let a stale qualification complete). | Two discriminating tests were added: the runtime **ignores** a declared current digest that does not match the derived one (the run completes on the derived digest and the evidence records the declared value), and a **material instruction change blocks the run at the CLI level** (a temp runtime tree with one canonical instruction source changed: the control run completes, the drifted run is blocked with `NO_ELIGIBLE_EXECUTOR`). The probe is now BOUND (2 failing tests). |
| **P2 (F3, D3 at the call site)** — the live source re-read was only bound at the function level, not at the call site of the derivation. | An injectable assembler seam (`assemble`) was added to the derivation and a test was added that feeds a self-consistent bundle whose source no longer matches the tree. The probe is now BOUND. |
| **P2 (P2, D2)** — the digest recomputation was not bound: returning the bundle's declared digest instead of the recomputed one left the suite green. | The same seam now binds D2 as well: a bundle that declares a digest it cannot prove is refused. The probe is now BOUND. |

### Mutation probes (after the repair)

| Probe | Mutation | Bound by |
| --- | --- | --- |
| P1 | the binding keeps the caller-declared digest | 3 failing tests — BOUND |
| P2 | the derivation returns the bundle's declared digest | 1 failing test — BOUND |
| P2b | the D2 consistency check is removed | 1 failing test — BOUND |
| P3 | the live source re-read is skipped at the call site | 3 failing tests — BOUND |
| P4 | the CLI passes the spec-declared fingerprints to the gate | 2 failing tests — BOUND |

## Verification (measured on the reviewed head)

- `node --test tests/vnext/*.test.mjs` — **606 pass / 0 fail** (the S7 group contributes 16 tests, the S8 group 38; the remainder is the rebased upstream suite).
- `node --test tests/tools/*.test.mjs` — 21 pass / 0 fail.
- `npm run validate`, `npm run validate-maws-vnext`, `npm run eval:maws-vnext` — issues `[]` / `ok:true`.
- `node scripts/tools/ci-gate.mjs` — PASS CI Gate.
- The re-qualification tool round-trips: dry run → `--write` → the reference run completes again.

## Scope boundary (what is NOT claimed)

- The specification stays **PROPOSED**. This run qualifies no model and no executor, grants no permission, activates no runtime and replaces no authority or approval decision.
- The derivation binds the **canonical instruction sources** (the binding core of the S6 bundle) plus whatever the run spec's assembly policy selects. A source that is neither canonical nor selected is not part of the effective instruction bundle and therefore does not move the digest — that is the S6 assembly rule, not a limitation of this run.
- The reference run spec's qualification is re-earned against the instruction state of the commit that carries it. A later change to a canonical instruction source invalidates it again; the repository gate fails until it is re-earned (`node scripts/tools/requalify-run-spec.mjs --spec runtime/cli/specs/reference-audit-v1.json --write`).
- The declared digest in a run spec is **not** a gate: it is recorded and ignored. The gate is the comparison of the *qualified snapshot* (historical) with the *derived* digest (now).

## Second review round (exact head `0023184`)

The repaired head was reviewed again by the same kind of reviewer (local audit agent, tool-driven, with mutation probes). Verdict: **PASS_WITH_FINDINGS** — every claimed repair was confirmed bound by a failing test, and the round produced new findings, which are recorded in the S8 run record (the symlink escape, the seam window, the discarded rollback failures, the unbound sub-behaviours of the F4 repair and the unbound readback half of F8) and repaired in the same change.

The two S7-specific observations of that round are closed here:

| Observation | Repair |
| --- | --- |
| the probe wording for P2 was imprecise: returning the bundle's declared digest at the *return* site is vacuous (D2 makes both values provably equal); the meaningful mutation point is the recomputation itself | The probe table names the recomputation site; the D2 consistency check and the recomputation are both bound (1 failing test each) |
| the `assemble` seam and the library-level gate parameters are public parameters of production modules | The seams are now **documented in the code** (module header, `deriveInstructionBinding`, `promoteSkillCandidate`, `validateOwnerApproval`) as test seams that the production path never uses: the CLI assembles the bundle itself, pins the anchor and pins the age bounds. |

## Rebase onto the upstream main

The branch was rebased onto `origin/main` = `0b49f65` (the DSI merge) after the second review round. The DSI lane touches **no** canonical instruction source (all eight were checked), so the derived digests are unchanged (`sha256:b897157a…` for the reference spec, `sha256:07f58608…` for the S12 bundle) and the committed pins remain valid. This was re-derived and verified, not assumed.

## Consequence for the S12 lane (recorded, not hidden)

`docs/authority-matrix.md` is one of the **canonical instruction sources** (authority class `canonical`). Registering the new surface families in it therefore moved the effective instruction state — and with it the digest the committed model-adaptive profiles pin.

That is the S7 semantics working end to end: the S12 profile pins became stale and the repository said so (`the committed profile pin matches the repository's current effective instruction digest`). The pins were **re-earned in this run** against the instruction state of this commit (six committed profiles, the S12 test constant and the S12 contract fixture). No S12 semantics, profile content or decision changed — only the instruction-digest binding moved, and it moved because the canonical instruction surface moved.

## Open obligations (not closed by this run)

- **Registry registration and Atlas representation: part of this closure, published after the source merge.** The Registry write (run change registration plus the CONTRACT_RECORD projection) is published first, the Atlas representation follows it, and the disposition in this folder is then rebound from `REQUIRED_BUT_BLOCKED` to `UPDATED` with the registry commit sha. Until that rebind is merged, the recorded status of this run is `REQUIRED_BUT_BLOCKED` — not closed.
- **Independent review limitation.** The review was performed by a local audit agent (a different model, tool-driven, with mutation probes). The codex review connector was quota-exhausted. No human approval is claimed and the slice is not presented as codex-reviewed.
- **Hosted CI state.** The GitHub Actions job could not execute (the account is locked for a billing issue). Every step of the workflow was replicated locally on the published head; the absence of a hosted run is disclosed rather than presented as a green gate.
