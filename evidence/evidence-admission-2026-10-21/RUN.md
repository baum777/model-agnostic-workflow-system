# S9 — Trusted Evidence Admission — Implementation Run Record

- Run: S9-TRUSTED-EVIDENCE-ADMISSION-2026-10-21
- Spec binding: `MAWS-SII-TARGET-SPEC-001` v0.2.0 (PROPOSED), **section 13** — an **extension of slice S8 (Governance Promotion)**, not a new spec slice. The specification's own **S9 is "Regression and Rollback"** and is NOT touched by this run; the naming collision is recorded here so no reader mistakes this run for that slice.
- Source of authority: the owner directive of 2026-10-21 (*"S9 — Trusted Evidence Admission. Close the remaining trust gap at the entrance of the promotion chain, without rebuilding the already-completed S8 provenance logic."*), with the standing invariants `Approval != Grant` · `Caller Input != Authority` · `Receipt != Verification`.
- Implementation commit: `41bb624` (signed, Ed25519).
- Base: `origin/main` = `d15c965` (the merge of the S5 path-confinement closure).

## Objective

S8 proved that a behavioral evaluation **reproduces** over a corpus. The question that stands above it was still open:

> Is **exactly this** evaluation result assigned to the skill that is **actually** being adopted, and to a **trustworthy admitted source**?

The investigation (directive items 1 and 2) established what was missing:

| | Before this run |
|---|---|
| The evaluation ↔ the adopted content | bound to a **subject LABEL** (`subject.ref`). No field anywhere carried the digest of the skill content the evaluation measured. |
| The evidence tree | **unbound**. No commit, no file set, no tree identity. The same bytes were equally acceptable at any path, and a record that was **never published** was accepted as long as it re-executed. |
| The frontdoor entrance | the weakest link of the chain: a **caller-supplied path**, read with no containment and no signature, and its `source_revision` digest form (a whole-directory hash) can **never** equal the promotion's content digest. |

## What was closed (owner scope)

The new module `scripts/tools/evidence-admission.mjs` and the new contract `core/contracts/evidence-admission.schema.json` add the two bindings:

| # | Rule | Refusal |
| --- | --- | --- |
| A1 | the admission lives in the canonical admission surface `evidence/admissions/` of the evidence tree, is read through the shared confinement primitive and is contract-validated | `EVIDENCE_ADMISSION_REF_INVALID` / `EVIDENCE_ADMISSION_MISSING` / `EVIDENCE_ADMISSION_INVALID` |
| A2 | the admission names the promoted skill and the measured subject | `EVIDENCE_ADMISSION_SKILL_MISMATCH` / `…SUBJECT_MISMATCH` |
| A3 | the admission names the **content digest** the evaluation is admitted FOR, and it must be the digest of the content being adopted | `EVIDENCE_ADMISSION_CONTENT_MISMATCH` |
| A4 | the admitted material is the **exact** set the S8 gate bound (record, baseline, corpus, with their digests) | `EVIDENCE_ADMISSION_MATERIAL_MISMATCH` |
| A5 | the admitted material is the **committed, unmodified** content of the evidence tree, and the commit is part of the published history | `EVIDENCE_ADMISSION_SOURCE_MODIFIED` / `…SOURCE_UNVERIFIABLE` / `…SOURCE_NOT_PUBLISHED` |
| A6 | the admission artifact itself is a **committed, reviewed** change | `EVIDENCE_ADMISSION_NOT_COMMITTED` |

The calculator `scripts/tools/admit-evidence.mjs` produces an admission (a dry run by default, `--write` to apply). It is a **CALCULATOR, not an authority**: the owner approval remains the decision, and the admission grants no permission, no qualification and no authority.

**The S8 gates are NOT rebuilt.** The provenance module, its contract and its twenty error codes are byte-identical to the S8 head; the admission is an **addition** that is verified *against* the attestation the S8 gate produced, and the post-adoption readback re-verifies both.

## Two defects the review rounds found in this change, and their repairs

Both independent review rounds returned findings; every finding was confirmed real and repaired.

| Finding | Repair |
| --- | --- |
| **The weaker `content` source kind was a silent downgrade in a versioned tree** — anyone who may write into the working copy could declare it, and the committed-source proof (A5) and the committed-admission proof (A6) were then never evaluated. Proven end to end. | The weaker kind is admitted **only where the tree is not versioned at all**. In a versioned tree the committed identity **must** be used, so the source trust cannot be downgraded. |
| **The content binding was stated as a proof** ("an old corpus can no longer qualify a new version") — it is a **declared** binding: the proof that the corpus measured that content needs the behavioral-eval contract to carry a subject-content digest. Proven false by a live probe. | The CHANGELOG, the authority matrix and the contract index now state the property exactly: a promotion cannot happen without an explicit admission that **names** the adopted content, and the corpus-to-content **proof** is the open S5-lane obligation. |
| The admission identity was derived from the material alone, so two admissions of the same evidence (different content or skill) collided on one file and the second overwrote the first | the identity now covers the material, the content **and** the skill |
| The exported readback silently skipped the admission re-verification when the record carried no admission | the gap is **reported**, not skipped |
| The material was read with a plain read, so the hardlink rule of the shared confinement primitive did not apply to it | it is read through the shared primitive |
| The calculator's `--out` was applied raw, so it could write outside the evidence tree | the write target is pattern-constrained to the canonical admission surface and confined to the tree |
| The adoption contract did not bind the source kind to the commit | the if/then correspondence is now in the contract |
| The one existing S8 assertion that changed (the CLI's refusal code) **dropped the CLI-level coverage of the anchor pinning** — proven by a differential mutation | the admission gate was moved **after** the owner-approval gate, so the shipped-evidence CLI case reaches the approval refusal again and the S8 property is covered again |
| Two new test titles claimed properties they did not exercise (the calculator CLI, the runtime authority rule) | both are exercised now; the runtime rule is proven by a test that does not depend on the contract |

## Mutation probes

Twenty-seven probes, each neutering one guard in an isolated copy of the committed tree. The first run reported **six unbound guards and one stale probe**; every one was a real gap in the test suite (or a stale probe definition) and was repaired: the specific readback-gap and not-committed messages, the content-source identity, the material-set self-check, the runtime authority rule, the calculator CLI, and the corpus-content probe retargeted to the layer that decides it (the S5 loader's confinement, which the S8 module's second layer now shadows).

**Final result: 27 of 27 BOUND, 0 unbound, 0 broken.** Every executed run genuinely executed its suite (tests > 0, cancelled 0, skipped 0, no uncaught exceptions). The strongest mutant is the git-source proof (nine failing cases across the admission suite), which is the trust anchor of the admission contract.

The S8 module's own corpus-content check is now **shadowed** by the S5 loader: the loader refuses the escape first, with the same error code. The property is enforced; the inner check is a redundant second layer. The S8 module is not touched by this run, so the redundancy is recorded here rather than repaired.

## Foreign gates — explicitly NOT closed by this run

| # | Foreign gate | Owner | What remains possible because of it |
| --- | --- | --- | --- |
| **F1** | The behavioral-eval contract carries a subject **label**, not a subject-content digest. The corpus is therefore not bound to the content it measured. | S5 lane (`core/contracts/behavioral-eval.schema.json`, the corpus manifest) | The admission's content digest is a **declaration**: a reviewer of one committed artifact decides the binding. The admission makes it explicit and reviewable; it does not make it a proof. |
| **F2** | The frontdoor admission of the same chain is a **caller-supplied path**, read with no containment and no signature; its analyzer report files are pattern-checked and never opened; and its `source_revision` digest form (a whole-directory hash) can never equal the promotion's content digest. | frontdoor lane (`runtime/skills/frontdoor.mjs`, `scripts/tools/skill-frontdoor-check.mjs`) | The frontdoor gate of the chain is satisfiable only by a **fabricated** admission: the analyzer guarantees (SkillSpector PASS, SkillEvaluator Tier-1 PASS) do not constrain the promotion chain at all. The only effective barrier left on that path is the signed owner approval. Reconciling the two digest forms is a cross-lane decision. |
| **F3** | The S5 lane's open PR **#63** (`fix/s5-path-confinement-followup-20261021`) hardens the shared confinement primitive this module imports (the link count re-checked on the opened descriptor). | S5 lane | The module's exported API is unchanged by that PR, so the two do not conflict; when it merges, this module inherits the hardening. The dependency is recorded here. |
| **F4** | The S8 freshness bound is a **declared** property: the content seal is unkeyed and does not cover `created_at`, so an editor of the evidence tree can re-date a record. A future-dated record is refused. | S5 lane (the behavioral-eval contract) | The freshness bound is not authenticated against a tree-writer. The content and source bindings are what this run adds. |

## Cross-lane consequences (resolved in this change)

Declaring the new surface moved the canonical instruction state (`docs/authority-matrix.md` is a canonical instruction source), so the derived effective instruction digest moved — **three times** during this run, once per governed-surface correction. Each time the pins were re-earned: the six S12 model-adaptive profile pins, their contract fixture and the test constant; the reference run spec's qualification; the HO-01 experiment's frozen reference-spec input; and the HO-01 comparison record and run bundles (re-frozen by re-running the experiment — the re-run reproduced the same behavioral evals, the same decision and the same metrics; only the definition and spec bindings moved).

## Gates at the published head

| Gate | Result |
| --- | --- |
| `node --test tests/vnext/*.test.mjs` | **732 of 732 pass, 0 fail** |
| `npm run validate` | ok, issues empty |
| `npm run validate-maws-vnext` | ok, 25 fixtures / 273 cases, issues empty |
| `npm run eval:maws-vnext` | ok, every fixture family passed |
| `npm run validate-behavioral-eval` | 7 cases checked, 0 unexpected results |
| `npm run validate-experiment-comparison` | 1 checked, 0 invalid |
| `npm run validate-executor-model-profile` | 19 + 7 cases checked, 6 profiles, 0 issues |
| `npm run validate-instruction-bundle` / `validate-instruction-integrity` / `validate-neutral` / `validate-secrets` | pass |
| Mimosa deep security scan | scan `2026-10-21T03-53-21.259Z-73d5465f9ae0`, seal `sha256:20ff861dee9dc77207bf7eebc6a69ce6301f2b6ee805982cc2ea7340ce4b523b`, **0 findings**, 201 packages scanned |

The hosted CI job could **not** execute: GitHub Actions is account-locked for billing and the job is created with **zero steps** (*"The job was not started because your account is locked due to a billing issue"*). Every step of that workflow was replicated locally on the published head; the absence of a hosted green gate is disclosed, not presented as one.

## Non-claims

- The specification stays **PROPOSED**. No skill was promoted, no runtime activated, no model or executor qualified, no permission granted; `authority_granted` stays `const false`.
- The owner trust anchor is unchanged and still publishes no key, so no approval can authorize a promotion: the chain still refuses at `OWNER_AUTHORITY_NOT_PUBLISHED`, and the bounded promotion acceptance remains an owner act.
- The admission is a **binding**, not a decision and not an authority.
- The content binding is a **declared, committed, reviewed** binding — not a proof that the corpus measured that content (F1).
- The review was executed by review agents with mutation probes; **no human approval** is claimed.
