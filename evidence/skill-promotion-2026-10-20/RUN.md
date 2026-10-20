# S8 Run Record — Governance Promotion (2026-10-20)

- Spec binding: `MAWS-SII-TARGET-SPEC-001` v0.2.0 (PROPOSED), slice S8 + sections 12.3/13.1/13.4.
- Source of authority: bounded owner run directive of 2026-10-20 ("run S11 implementierung und closure S7, S13 und S8"). Materialization only; the specification stays PROPOSED, no runtime authority is granted, and no actual skill is promoted on the live tree.
- Branch: `s8/governance-promotion-20261020b`, based on `main` (rebased onto the S7 and S13 merges). The earlier stacked branch `s8/governance-promotion-20261020` and its pull request were superseded.

## What was implemented

- `core/contracts/skill-promotion-adoption.schema.json` — SkillPromotionAdoptionRecord 1.0.0: the candidate identity with the **screened digest** next to the adopted digest, the frontdoor admission binding (record_ref + whole-record digest + `implementation_disposition` const `ELIGIBLE` + the screened digest), the digest-bound S5 behavioral eval evidence with the **subject**, the **corpus digest** and the **evidence age bound**, the canonical owner approval **bound to the approved candidate digest**, the versioned canonical adoption with the **superseded version read from the canonical tree** and the **append-only adoption ledger reference**, the truthful export regeneration state, the fail-closed post-adoption readback (`readback_digest_match` const `true`), and `authority_granted` const `false`.
- `scripts/tools/promote-skill-candidate.mjs` — the versioned canonical adoption path: `validateFrontdoorAdmission` (schema + ELIGIBLE + no-authority), the candidate identity and content binding against the frontdoor, `validateEvalEvidence` (schema + semantic valid, `computeContentDigest` re-match, subject binding, one corpus, age bound, no BLOCKED record, IMPROVEMENT_PROVEN required), the owner-approval gate bound to the candidate digest, the replay-protected adoption ledger, the canonical-tree version readback, the artifact version check, the closed skill-id charset and the canonical-root containment check, the fail-closed write/readback, the rollback of a contract-invalid mutation, the semantic rules, and the isMain-guarded CLI (`npm run promote-skill-candidate`).
- `evals/fixtures/maws-vnext/skill-promotion-adoption.contracts.json` — 4 schema-decidable cases (valid chain; rejected authority grant; rejected non-owner approval; rejected unperformed export without a reason), each negative case asserting **which rule** rejects it; catalog-registered.
- `tests/vnext/skill-promotion.test.mjs` — 22 tests over the full chain in isolated temp canonical trees.
- READMEs (root + `core/contracts/README.md` tool catalog + `evals/README.md`), `package.json` (`promote-skill-candidate`), `evals/catalog.json`, `CHANGELOG.md`.

## Slice checkbox mapping

| Checkbox | Evidence |
| --- | --- |
| Skill Frontdoor integrieren | `validateFrontdoorAdmission` on the real frontdoor contract; BLOCKED admission rejected (test); the admission must be for the promoted skill AND must have screened the adopted content (tests) |
| Eval-Evidence an Proposal binden | `validateEvalEvidence` with `computeContentDigest` re-match, subject binding, one corpus and an age bound; tampered digest, foreign subject, mixed corpora and stale evidence rejected (tests) |
| Owner-Approval-Vertrag festlegen | schema const `canonical_owner`; the approval must name the candidate digest it approves and is part of the adoption digest (schema case + tests) |
| Versionierte kanonische Adoption implementieren | the superseded version is read from the canonical tree, the adopted version must be the version the artifact declares, the applied change is recorded in the adoption ledger, a replayed adoption id is refused (tests) |
| Registry-/Provider-Exports regenerieren | **NOT performed by this slice** — the record states the export regeneration as not performed with a reason, and the canonical export regeneration remains an open obligation |
| Post-Adoption-Readback durchführen | fail-closed write-readback (READBACK_DIGEST_MISMATCH), the standalone `postAdoptionReadback` tamper detection, and the ledger cross-check (tests) |

## Review round 1 — findings and repair

The independent review of the first S8 implementation (local audit agent, tool-driven with mutation probes; the codex connector was quota-exhausted for this slice) returned **FAIL**: the governance envelope was in place, but the chain itself was largely decorative. Every finding was real and is repaired here.

| Finding | Repair |
| --- | --- |
| P1 — the recorded disposition artifact violated the repository's own `registry-disposition.v1` contract (21 validator issues) and broke the merged repository-wide gate | Rewritten in the canonical grammar |
| P1 — the export regeneration was recorded as `performed: true` while no export was ever written | The record now states the export regeneration as **not performed**, with the reason and the null timestamp; the schema makes the two states exclusive, and the canonical export regeneration is recorded as an open obligation instead of being claimed |
| P1 — the promotion was not bound to the candidate it claims to promote: the admission's skill id and screened content and the eval's subject were never compared | The admission must be for the promoted skill and must have screened the adopted content; every eval record must measure the promoted skill |
| P1 — the superseded version was a caller-asserted string that allowed a silent downgrade of a live skill | The superseded version is read from the canonical tree, and the adopted version must be the version the promoted artifact itself declares |
| P1 — no replay or double-adoption protection | An append-only adoption ledger records every applied adoption; a replayed adoption id and an adoption that does not move the skill past its last adopted version are refused |
| P1 — the post-adoption readback fail-closed path was not test-bound (deleting it left the suite green) | A negative test drives the mismatch and asserts `READBACK_DIGEST_MISMATCH`; the recorded readback value is the computed one |
| P2 — `readback_digest_match` was a literal and not `const` in the contract | The value is computed and the schema makes it `const true`, so a failed readback is unrepresentable |
| P2 — the owner approval was self-asserted and invisible to the adoption digest | The approval must name the candidate digest it approves and is part of the adoption digest |
| P2 — the skill id was not path-validated and the canonical write could escape the canonical root | The skill id is constrained to a closed charset and the resolved path must stay inside the canonical root |
| P2 — the improvement flag was a free boolean that was not cross-checked against the verdict list | A semantic rule refuses `improvement_proven` without an `IMPROVEMENT_PROVEN` record (and the other self-contradictions) |
| P2 — the evidence carried no staleness or corpus binding | The evidence must be within a declared age bound and come from one corpus |
| P2 — the CLI failed open on gate violations (uncaught stack trace) | The CLI returns the structured refusal (`ok:false`, exit 2) |
| P2 — the canonical file was written before the contract was validated, so a contract-invalid record left the file in place | The file is restored before the issues are returned; a failed promotion leaves no mutation |
| P3 — the run record stated a wrong test count and a stale branch name | Corrected to the measured numbers and the current branch/base |
| P3 — the new tool was not registered in the tool catalog or the root README | Both are wired |
| P3 — the fixture's negative cases did not pin which rule rejects them | Each negative case now carries an `expected_error` that the test asserts |

## Governance posture (spec 12.3/13.4)

- Frontdoor admission is a mandatory complement, never replaced by behavioral evidence (both are bound, both are required).
- Eval PASS is evidence, never authority; approval is a gate, never a permission; `authority_granted` is `const false` at the schema level.
- The improvement loop cannot self-approve: the only legal approver value is `canonical_owner`, and the approval must name the content it approves.
- An actual promotion on the live canonical skill tree remains an owner act; this run materialized the mechanism and proved it in isolated temp trees only. **No skill was promoted on the live tree by this slice.**

## Verification

- `node --test tests/vnext/*.test.mjs` — **448/448 PASS** (includes the 22 S8 tests).
- `npm run eval:maws-vnext` — ok:true (the promotion fixture incl. the per-case expected-error assertions).
- `npm run validate-maws-vnext` — issues: [].
- `npm run validate` — ok:true.
- `node scripts/tools/validate-registry-disposition.mjs evidence/skill-promotion-2026-10-20/registry-disposition.json` — passed: true.
- Mutation probes after the repair: the approval gate removed, the approver check dropped, the evidence digest comparison removed, the frontdoor eligibility check removed and the readback fail-closed path removed — each is bound by at least one failing test.

## Closure state

| Surface | State |
| --- | --- |
| SOURCE | VERIFIED — merged in MAWS pull request (see the disposition artifact for the publication evidence) |
| REGISTRY | **OPEN (REQUIRED_BUT_BLOCKED)** — the run change registration and the `CONTRACT_RECORD` for `core/contracts/skill-promotion-adoption.schema.json` are written after this branch merges, in `unitera-registry`; the local disposition stays `REQUIRED_BUT_BLOCKED` until that publication exists and the disposition is rebound to `UPDATED` with the registry commit sha |
| ATLAS | **OPEN (REQUIRED_BUT_BLOCKED)** — the Atlas claim for this slice is written after the Registry publication |
| CONSISTENCY | **PARTIAL** until the two projections above are published |

## Open obligations (not closed by this run)

- **Canonical export regeneration: OPEN.** The canonical registry and provider export surfaces are not regenerated by this slice. The record states this truthfully instead of claiming a regeneration that never happened.
- **Live-tree promotion: OWNER ACT.** No skill was promoted on the live canonical tree; the mechanism was exercised in isolated temp trees only.
- **Independent review limitation.** The codex review connector was quota-exhausted for this slice; the independent review was performed by a local audit agent (a different model, tool-driven, with mutation probes). No human approval is claimed, and the slice is not presented as codex-reviewed.
