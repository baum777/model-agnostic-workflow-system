# S5/F2 — Trusted Subject Content Binding and Verified Frontdoor Admission (2026-10-21)

Objective (owner directive of 2026-10-21): close the remaining S5 subject-provenance and
Frontdoor-admission gaps in the Skill-Promotion Trust Chain — evidence-first, minimal-diff,
fail-closed. These are exactly the foreign gates **F1** and **F2** that the S9 run record
(`evidence/evidence-admission-2026-10-21/RUN.md`) named; F3 was closed by the S5 follow-up
PR #63 during that run, and F4 (the unkeyed freshness seal) is NOT in this scope and stays
open with its owner.

Standing invariants: `Approval != Grant` · `Caller Input != Authority` · `Receipt != Verification`.
No owner-key publication, no production promotion, no runtime activation, no authority grants,
no spec adoption. Hosted CI is NOT_VERIFIED (account billing block); every green result below
is a LOCAL result.

## F1 — S5 subject-content binding (the measured content, not a label)

Before this run the behavioral-eval record carried a subject LABEL (`subject.ref`) and a
self-seal (`reproducibility.content_digest` is the digest of the record itself); no field
anywhere carried the digest of the skill content the evaluation measured. The corpus→content
proof was the declared, open S5-lane obligation.

The binding is now carried by the corpus and verified before any case runs:

1. The corpus manifest declares `subject.content_path` + `subject.content_digest`. For a
   `kind: skill` subject this is MANDATORY (`CORPUS_SUBJECT_CONTENT_UNBOUND`); every other
   subject kind may carry the same binding voluntarily. The path is confined to the corpus
   directory through the shared confinement primitive (the one-link rule included).
2. The loader verifies the content bytes against the declared digest
   (`CORPUS_SUBJECT_DIGEST_INVALID`, `CORPUS_SUBJECT_DIGEST_MISMATCH`) and the record subject
   carries the VERIFIED `content_digest` (behavioral-eval contract **1.1.0**: required for
   `kind: skill`). The record subject never carries the path — the binding is by content,
   not by location.
3. `assertBaselineRecordUsable` re-checks the binding: a supplied baseline that measured
   other content than the corpus carries is refused (`BASELINE_RECORD_MISMATCH`).
4. The S8 re-execution re-derives the subject field-for-field (no S8 change needed — the
   subject is an execution field), and the S8 attestation now carries
   `subject_content_digest` (evidence-provenance contract extended, required, nullable for
   unbound subject kinds).
5. The S9 admission gate closes the chain: an evaluation may only be admitted for the content
   it actually MEASURED (`EVIDENCE_ADMISSION_SUBJECT_CONTENT_MISMATCH`), and the calculator
   refuses to emit an admission whose content diverges from the corpus subject. The S9 run's
   "declared binding" caveat is thereby retired for skill subjects.

Historical record sets keep their 1.0.0 records as published history; they cannot re-verify
under the current contract/runner, which is the binding doing its job. The CURRENT shipped
evidence set is `evidence/skill-effectiveness-evals-subject-bound-2026-10-21/`, produced by
the current runner over the committed `evals/skill-effectiveness` corpus.

## F2 — the frontdoor admission is verified evidence, not a caller path

Before this run the promotion read a caller-supplied admission path with no containment, no
signature and no reconciliation of digest semantics: the receipt's `source_revision` carries a
whole-directory hash that can never equal the promotion's content digest, and the named
analyzer reports were never opened — the gate was satisfiable only by a fabricated admission.

The receipt is now verified as evidence:

1. **Surface**: the receipt must live at `sandbox/runs/<run>/skill-frontdoor-admission.json`
   INSIDE the canonical tree, behind the canonical containment proof
   (`FRONTDOOR_ADMISSION_SURFACE_INVALID`).
2. **Identity**: the admission id must re-derive from the screened content identity, the run
   directory and the decision time — the same derivation the checker performs when it writes
   the receipt (`FRONTDOOR_ADMISSION_IDENTITY_MISMATCH`).
3. **Analyzer reports**: both named report files are read from the SAME screening run and the
   declared statuses/severities/counts must re-derive from the report content under the very
   classifiers the checker uses (`FRONTDOOR_REPORT_MISSING`, `FRONTDOOR_REPORT_INVALID`,
   `FRONTDOOR_REPORT_MISMATCH`). The analyzer guarantees constrain the chain through their
   reports. No separate disposition re-derivation exists: every derivation input is pinned by
   the report check, the contract pins the legal disposition pairs, and the ELIGIBLE gate
   pins the requirement — a divergent disposition cannot reach this point, and an
   unreachable guard is removed rather than kept as untestable code.
4. **Digest semantics**: the receipt records `candidate.content_digest` (sha256 of the
   screened SKILL.md bytes; frontdoor contract **1.1.0**) as the form the promotion compares;
   the whole-tree `source_revision` digest stays as provenance of the screened tree and is
   never compared against content.
5. **Fabrication rejection**: the approval payload covers `frontdoor_admission_digest`
   (optional in owner-approval.schema.json, signed when present); the promotion requires the
   binding (`OWNER_APPROVAL_ADMISSION_UNBOUND`) and its equality with the consumed receipt
   (`OWNER_APPROVAL_ADMISSION_MISMATCH`), so a fabricated or substituted admission fails the
   owner signature (a payload that did not cover the binding would not — that property is
   bound by a test). The post-adoption readback cross-checks the recorded pair.
6. **Screening-time re-anchor**: the checker re-hashes the candidate after the analyzers ran
   and refuses to write a receipt whose identity moved between the hash and the scan.

Cross-surface changes: `skill-promotion-adoption.schema.json` (frontdoor block and candidate
block carry the content digest; approval carries the binding), `evidence-provenance.schema.json`
(`subject_content_digest`), fixtures regenerated, the six S12 model-adaptive profile pins,
their contract fixture and the test constant re-pinned, the reference run spec requalified
(instruction digest `7e2d8027…` → `89cb772b…`), the HO-01 experiment's frozen reference-spec
input re-pinned and the HO-01 comparison re-frozen by re-running the experiment (same
behavioral evals, same decision, same metrics: routing 0, output −0.1875, security 0,
`IMPROVEMENT_REJECTED`/`CONFIRMED` — only the bindings moved).

## Verification (all local; hosted CI NOT_VERIFIED)

- `npm run test:vnext`: **753 of 753 pass** (was 734 before this run; +19 tests bind the new
  guards). `tests/tools` + `tests/runtime`: 87/88 with the single failure
  ("unimplemented runtime commands fail closed") PROVEN pre-existing on pristine origin/main
  (`5ed7216`) by an isolated run — not a regression of this change.
- Validators: `validate`, `validate-maws-vnext`, `validate-behavioral-eval` (10 cases),
  `validate-experiment-comparison`, `validate-executor-model-profile` (6 profiles),
  `validate-instruction-integrity` all green. `runtime:validate` reports the pre-existing
  "Runtime run directory not found" state (identical on origin/main — not a regression).
- `eval:maws-vnext`: 24/24 PASS.
- Mutation probes: **13 of 13 BOUND**. The first battery returned 9 bound and 4 findings
  (a weak probe pairing plus three guards unbound by their named suites: the surface-pattern
  guard, the id↔path guard, and the signature-payload coverage of the admission binding);
  each was a real test gap, repaired with a dedicated binding test and re-probed to bound.
- Independent review (review agent distinct from the author, full-diff, attack model: a
  writer with filesystem access to the canonical and/or evidence tree): **0 P1 / 2 P2 / 4 P3**.
  - P2-1 (checker TOCTOU between hash and analyzer runs) — repaired: post-scan re-anchor.
  - P2-2 (per-verification corpus reloads could desync the attestation's corpus from the
    measured one) — repaired: ONE corpus load per verification; containment sweep, subject
    check, both re-executions and the attestation digest derive from that single object, plus
    a dev/ino re-anchor after the re-executions (`EVIDENCE_CORPUS_CHANGED`).
  - P3-1 (approval read without containment) — repaired: `assertCanonicalTarget` in
    `readOwnerApproval` (`OWNER_APPROVAL_PATH_ESCAPE`).
  - P3-2 (disposition not re-derived; readback cross-check missing) — the disposition
    re-derivation is structurally subsumed by the report check + schema + ELIGIBLE gate
    (an added branch would be unreachable code, removed per repository precedent); the
    readback cross-check was added and is bound by a test.
  - P3-3 (canonical-write TOCTOU: check-then-write without O_NOFOLLOW) — NOT repaired in
    this run: pre-existing S8 write-path behavior outside this directive's scope, platform-
    specific repair, recorded as residual R-F2-3 below.
  - P3-4 (overstating residual comment) — repaired.

## Residuals (stated, not hidden)

- **R-F2-1**: the receipt and its reports carry no signature of their own. The F2 gates prove
  coherence with surface, identity and artifacts; AUTHORSHIP is bound by the signed owner
  approval (`frontdoor_admission_digest`). A writer who can fabricate a full coherent
  screening set AND obtain an owner signature over its digest defeats this — the owner
  signature is the trust anchor, by design.
- **R-F2-2**: race windows narrowed, not eliminated: the checker's re-anchor and the
  provenance single-load + re-anchor detect replacement, not a same-inode in-place rewrite
  between check and use (the documented R1 class of the confinement primitive); such a writer
  holds write access to the material and the change is visible in the digests the chain binds.
- **R-F2-3**: the canonical write path (promotion) is check-then-write without `O_NOFOLLOW`;
  pre-existing, platform-specific, deferred with owner (S8 lane owner).
- **R-F1-1**: non-skill subject kinds (routing_profile, harness, instruction_set) carry the
  content binding voluntarily; an evaluation of such a subject can pass S8 but is refused at
  the admission gate (its attestation carries `subject_content_digest: null`).
- **F4 (foreign, open)**: the S8 freshness bound remains a declared property (unkeyed seal).
- Hosted CI could not run (account billing block); every result above is local.

## Non-claims

- The specification stays PROPOSED; nothing is adopted.
- No skill is promoted; the canonical trust anchor still publishes no key and the chain still
  refuses at `OWNER_AUTHORITY_NOT_PUBLISHED`; the bounded promotion acceptance remains an
  owner act.
- The review was executed by review agents with mutation probes; no human approval is claimed.
- Local PASS is not hosted PASS.

## Publication

- Implementation: MAWS PR **68**, branch `feature/s5-frontdoor-evidence-20261021`,
  head `23932038809c169ad974ee7949d82ea973e0fba3`, merged as
  `df8c683e557a711562bc6cc61ac8504120825161` (2026-10-21T11:34:03Z) after a rebase onto
  main `0daaa483…` (PRs #66/#67 landed during the run; the residual-wording conflict took
  the main side, the CHANGELOG kept both entries). 756/756 vnext on the rebased head.
- Registry: unitera-registry PR **262**, head `da13a41ddc632dad2db2b55042051918530bcb2f`,
  merged as `2dc7b5bca550417ce4f28de3d395d1896c85bc66`; `validate_registry.py` PASS.
  Records: `MAWS_S5_FRONTDOOR_EVIDENCE_2026_10_21_001.yaml` (run registration) and
  `MAWS_S5_FRONTDOOR_CONTRACTS_2026_10_21_001.yaml` (the five CONTRACT_RECORD amendments).
- This rebind: the disposition advances from `REQUIRED_BUT_BLOCKED` to `UPDATED` with the
  registry commit sha (the S9 precedent of the same run-day). The Atlas representation
  follows as its own surface and is recorded in the Atlas claim.
