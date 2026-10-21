# S8 Evidence Provenance — Implementation Run Record

- Run: S8-EVIDENCE-PROVENANCE-2026-10-21
- Spec binding: `MAWS-SII-TARGET-SPEC-001` v0.2.0 (PROPOSED), slice S8 (the evidence-provenance obligation named by the owner directive of 2026-10-21).
- Source of authority: the owner directive of 2026-10-21 — *"S8 Evidence Provenance: Sicherstellen, dass Qualification-Evidence nicht bloß durch Caller-Behauptungen legitimiert wird, sondern auf überprüfbare, unveränderliche Ausführungsergebnisse zurückgeführt werden kann."* — with the standing invariants `Approval != Grant` · `Caller Input != Authority` · `Receipt != Verification`.
- Implementation commit: `cc7a815c765591fa6bdfb71c8b1f860bd4f88c9a` (signed, Ed25519, key `3A298DA2BAF86F2B81A5FD73C69176541F3B655E`).
- Base: `origin/main` = `2f94f8c5eab6ae3216b9dd0551a03624a88fd55c`.

## Objective

The behavioral evidence of the promotion chain was the **one** link that was asserted by the caller instead of recomputed from disk. The promotion input carried the eval record object, its digest and its verdict inline; `record_ref` was a free string that was never resolved; the corpus was never consulted; the verdict was taken as given. A caller could fabricate a schema-valid `BehavioralEvalRecord` with `verdict: IMPROVEMENT_PROVEN` and the chain accepted it.

The obligation: the evidence must be traceable to **verifiable, immutable execution results**.

## What was closed

| # | Obligation | How it is enforced | Bound by |
| --- | --- | --- | --- |
| E1 | The record is read from the canonical evidence surface, never from the caller | `resolveEvidencePath` + `readEvidenceRecord` in `scripts/tools/evidence-provenance.mjs`; the promotion input may only NAME a record | `EVAL_EVIDENCE_INLINE_RECORD_FORBIDDEN`; the reference-shape and escape cases |
| E2 | The record satisfies its own content seal | `assertRecordSealed` (candidate and baseline) | `EVIDENCE_RECORD_SEAL_MISMATCH` |
| E3 | The corpus is resolved in the tree and re-hashed from disk | `resolveCorpus` + `corpusTreeDigest` (every family file and every variant file) | `EVIDENCE_CORPUS_MISMATCH`; the corpus-digest case |
| E4 | The evaluation is **re-executed** over that corpus and must reproduce the record | `reExecute` + `executionDifferences` over the corpus-derived fields | `EVIDENCE_EXECUTION_MISMATCH` (a forged record, a moved corpus) |
| E5 | The comparison **and** the verdict are **re-derived** from the baseline on disk | `compareRecords` on the disk baseline + the `baseline_ref` check | `EVIDENCE_COMPARISON_MISMATCH` (a forged comparison, a flipped verdict, a forged baseline reference) |
| E6 | Only a replayable evaluation is traceable | `assertRecordReplayable` | `EVIDENCE_MODE_UNVERIFIABLE` |
| E7 | The subject, the corpus and the promoted skill are one subject | the corpus subject ≡ the record subject ≡ the promoted skill | `EVIDENCE_SUBJECT_MISMATCH` |
| E8 | The declared age stays inside the bound; a future-dated record is refused | the age bound + the future check | `EVIDENCE_STALE` |
| E9 | The attestation is contract-shaped and unforgeable in shape | `core/contracts/evidence-provenance.schema.json`; `execution_rederived` and `comparison_rederived` are `const true` | the schema-decidable fixture (6 cases) |
| E10 | The post-adoption readback re-**verifies** the bound evidence, not only its digest | `postAdoptionReadback` re-executes and re-derives; a missing evidence tree is REPORTED, never silently skipped | the readback case |
| E11 | The caller cannot redirect the evidence, the trust anchor or the age bound | the CLI allowlist: the evidence tree, the anchor and the bounds are pinned to the installation | the CLI-pinning case |

The new surfaces: `scripts/tools/evidence-provenance.mjs`, `core/contracts/evidence-provenance.schema.json`, `tests/vnext/evidence-provenance.test.mjs` (25 cases), `evidence/skill-effectiveness-evals-2026-10-21/`.

## Two live defects the new gate found

**D1 — the shipped behavioral evidence was a stale receipt.** The records of 2026-10-20 were sealed at `2026-10-20T17:01:56Z`. The S7 slice (commit `4d99c27`) changed `evals/skill-effectiveness/negative-cases/cases.json` about six hours later, so the records no longer reproduce from the corpus: the `negative` family digest moved (`d4b80eb1…` → `e87e4a58…`) and the assertion count moved (15 → 16). No gate noticed: the existing validator checks the record's shape and its semantics in isolation, never the corpus. The evidence is re-issued under `evidence/skill-effectiveness-evals-2026-10-21/` (verdict `IMPROVEMENT_PROVEN`, security gate `PASS`), the superseded evidence is kept and annotated, and the staleness is bound by a test that asserts the refusal (`EVIDENCE_EXECUTION_MISMATCH`).

**D2 — a blocked evaluation was not recordable.** `compareRecords` returned early for a `BLOCKED` candidate without naming its baseline, while `core/contracts/behavioral-eval.schema.json` requires `baseline_ref` for **every** `CANDIDATE` record. A genuinely blocked evaluation therefore produced a record that violated its own contract. Repaired in the producer (the blocked candidate names its baseline); the repair is bound by the `BLOCKED` promotion case.

## Independent review

Two independent review rounds were executed on the exact heads, each by a review agent distinct from the author, each with mutation probes. Both returned `PASS_WITH_FINDINGS`; **every finding was confirmed real** and is repaired in this change:

| Finding | Repair |
| --- | --- |
| The freshness bound rested on `created_at`, which the content seal does not cover → a re-dated record passed it | A future-dated record is refused; the bound is stated as a **declared**, not an authenticated, property (the code, the contract, the CHANGELOG and the contract index say so) |
| The re-execution was seeded with the record's own `eval_id`, `evidence_refs` and `subject.instruction_revision` → three fields compared only with themselves | The references and the instruction revision are now derived from the **corpus**; the eval id is documented as a label and is no longer claimed to reproduce |
| The baseline reference was unbound for a rejected candidate (the R3 rule covers `IMPROVEMENT_PROVEN` only) | The `baseline_ref` is compared against the re-derived value; the case is bound with a genuinely rejected candidate |
| The corpus **content** was not proven to stay inside the tree (a family file that is a symlink out of it was accepted) | Every file the corpus names is containment-proved against the corpus directory (`EVIDENCE_CORPUS_CONTENT_ESCAPES`) |
| The gate and the post-adoption readback could read **different** evidence trees | One tree is resolved once and used by both |
| A readback without an evidence tree silently skipped the re-verification | The gap is **reported** as an issue |
| The attestation's seal and digest descriptions claimed more than an unkeyed digest proves | The contract now states that the seal is unkeyed and that `record_digest` is a digest of the parsed record, not of the file bytes |
| A test assertion was vacuous (`digest === digest.slice(7)`) | It now compares against an independently recomputed digest |
| The new contract was not registered in `core/contracts/README.md` | It is, with the same density as its two sibling S8 contracts |
| The CHANGELOG's interval ("four hours") was wrong | Corrected to about six hours (17:01:56Z → 23:23:41Z) |
| The instruction-binding artifact of the HO-01 run bundles was **outside** the lane's run-evidence digest, which made the previous run's claim that the projection covers it FALSE | The artifact is now projected into the digest; its wall-clock `observed_at` is dropped like the other observation times; a new test binds it |
| The `baseline_ref` / `eval_id` / `evidence_refs` fields were not all pinned | Pinned as above, each with a negative case |

### Residuals — recorded, not repaired

| # | Residual | Owner | Why it is not repaired here |
| --- | --- | --- | --- |
| R1 | The freshness bound is a **declared** property: the content seal is unkeyed, so an editor of the evidence tree can re-date a record | S5 lane (the behavioral-eval contract) | A trusted timestamp needs an anchor outside the record; the behavioral eval contract carries none. The gate refuses a stale and a future declaration and does not claim to authenticate the field |
| R2 | The corpus is not bound to the **adopted content**: the corpus names its subject by label, so an old corpus can measure an old skill version | S5 lane (the behavioral-eval contract) | The binding needs a subject-content digest in the behavioral eval record and the corpus manifest; that contract is not this slice's |
| R3 | The frontdoor admission of the same chain is still a caller-supplied file at an arbitrary path | frontdoor lane | A different link of the chain and a different surface; it is recorded here rather than silently changed |

## Mutation probes

Thirteen probes were executed on the exact head, each neutering one guard in an isolated copy of the committed tree. The first run reported **four guards without a failing test** (the verdict re-derivation, the reference shape check, the refusal of a caller-supplied record object and the readback re-verification) — all four were real gaps in the test suite, were repaired, and the probes were re-run against the refreshed head: **13 of 13 BOUND**, 0 unbound, 0 broken, every mutated run genuinely executed (tests > 0, cancelled 0, skipped 0). Six further probes cover the guards that the review rounds added; the totals are in the Registry record.

## Cross-lane consequences (resolved in this change)

Declaring the new surface moved the canonical instruction state (`docs/authority-matrix.md` is a canonical instruction source), which moved the derived effective instruction digest. Resolved here, in the same change set:

- the six S12 model-adaptive profile pins and their contract fixture and test constant (re-earned: `fa5eb48a…` → `6fb34ad0…`);
- the reference run spec's qualification snapshots (re-earned with the canonical tool: `f96f62b7…` → `5cd347a2…`);
- the HO-01 experiment's frozen reference-spec input (`cfca89a2…` → `787b6ada…`);
- the HO-01 comparison record and its run bundles (re-frozen by re-running the experiment). The re-run reproduced the **same** behavioral evals, the same decision and the same metrics; only the definition and spec bindings moved. The re-freeze was necessary twice: once for the moved digest and once more because the instruction-binding artifact is now inside the run-evidence digest.

The open S5 lane PR #59 (`fix/s5-path-confinement-20261021`, "confine the S5 corpus loader to real paths, symlinks included") hardens the same corpus loader this gate re-executes over. It is a foreign lane and is **not** merged here. This gate closes the corpus-directory and corpus-content containment itself; PR #59 additionally closes the time-of-check/time-of-use window.

## Gates at the published head

| Gate | Result |
| --- | --- |
| `node --test tests/vnext/*.test.mjs` | **683 of 683 pass, 0 fail** (the S8 evidence-provenance group contributes 25, the promotion group 47) |
| `npm run validate` | ok, issues empty |
| `npm run validate-maws-vnext` | ok, 24 fixtures / 268 cases, issues empty |
| `npm run eval:maws-vnext` | ok, all fixture families passed |
| `npm run validate-behavioral-eval` | 7 cases checked, 0 unexpected results |
| `npm run validate-experiment-comparison` | 1 checked, 0 invalid |
| `npm run validate-executor-model-profile` | 19 + 7 cases checked, 6 profiles, 0 issues |
| `npm run validate-instruction-bundle` / `validate-instruction-integrity` / `validate-neutral` / `validate-secrets` | pass |
| Mimosa deep security scan | scan `2026-10-21T03-53-21.259Z-73d5465f9ae0`, seal `sha256:20ff861dee9dc77207bf7eebc6a69ce6301f2b6ee805982cc2ea7340ce4b523b`, **0 findings**, 201 packages scanned |

The hosted CI job could **not** execute: GitHub Actions is account-locked for billing and the job reports *"The job was not started because your account is locked due to a billing issue"*. Every step of that workflow was replicated locally on the published head; the absence of a hosted green gate is disclosed, not presented as one. The Chrome-dependent render/a11y eval kinds remain unclaimed.

## Non-claims

- The specification stays **PROPOSED**. Nothing is adopted.
- **No** skill was promoted, **no** runtime was activated, **no** model or executor was qualified, **no** permission or capability was granted. `authority_granted` stays `const false`.
- The canonical owner trust anchor is **unchanged** and still publishes no key (`PENDING_PUBLICATION`, `keys: []`), so no approval can authorize a promotion: the chain still refuses at `OWNER_AUTHORITY_NOT_PUBLISHED`. The bounded promotion acceptance remains an owner act.
- The gate proves that a receipt **reproduces**. It does not prove that the corpus is the right corpus for the adopted content (R2), and it does not authenticate a timestamp (R1).
- The review was executed by review agents with mutation probes, not by a human approver. No human approval is claimed.
