# S8 Run Record — Governance Promotion (2026-10-20)

- Spec binding: `MAWS-SII-TARGET-SPEC-001` v0.2.0 (PROPOSED), slice S8 + sections 12.3/13.1/13.4.
- Source of authority: bounded owner run directive of 2026-10-20 ("run S11 implementierung und closure S7, S13 und S8"). Materialization only; the specification stays PROPOSED, no runtime authority is granted, and no actual skill is promoted on the live tree.
- Branch: `s8/governance-promotion-20261020`, stacked on `s13/benchmark-comparison-20261020` (stack: S11 → S7 → S13 → S8); rebased per stack as predecessor PRs merge.

## What was implemented

- `core/contracts/skill-promotion-adoption.schema.json` — SkillPromotionAdoptionRecord 1.0.0: candidate identity (skill_id, adopted_version, candidate_digest), frontdoor admission binding (record_ref + whole-record digest + `implementation_disposition` const `ELIGIBLE`), digest-bound S5 behavioral eval evidence, canonical owner approval (`approver` const `canonical_owner`), versioned canonical adoption (semver-strict, `adoption_digest` over the bound chain), export regeneration, post-adoption readback, `authority_granted` const `false`.
- `scripts/tools/promote-skill-candidate.mjs` — the versioned canonical adoption path: `validateFrontdoorAdmission` (schema + ELIGIBLE + no-authority), `validateEvalEvidence` (each referenced S5 record schema+semantic-valid, `computeContentDigest` re-match, BLOCKED excluded, IMPROVEMENT_PROVEN required), owner-approval gate (fail closed when absent or non-owner), semver-strict version ordering, canonical materialization into the caller-provided `canonicalRoot` with fail-closed readback (`READBACK_DIGEST_MISMATCH`), `postAdoptionReadback` re-verification, isMain-guarded CLI (`npm run promote-skill-candidate`).
- `evals/fixtures/maws-vnext/skill-promotion-adoption.contracts.json` — 3 schema-decidable cases (valid chain; rejected authority grant; rejected self-approval); catalog-registered.
- `tests/vnext/skill-promotion.test.mjs` — 9 tests over the full chain in isolated temp canonical trees.
- READMEs, `package.json` (`promote-skill-candidate`), `evals/catalog.json`.

## Slice checkbox mapping

| Checkbox | Evidence |
| --- | --- |
| Skill Frontdoor integrieren | `validateFrontdoorAdmission` on the real frontdoor contract; BLOCKED admission rejected (test) |
| Eval-Evidence an Proposal binden | `validateEvalEvidence` with `computeContentDigest` re-match; tampered digest rejected (test) |
| Owner-Approval-Vertrag festlegen | schema const `canonical_owner`; missing/self approval rejected (schema case + tests) |
| Versionierte kanonische Adoption implementieren | semver-strict adoption (downgrade/equal rejected), `adoption_digest` over the bound chain |
| Registry-/Provider-Exports regenerieren | `export_regeneration` recorded with real export surface refs; readback re-verifies the canonical content |
| Post-Adoption-Readback durchführen | fail-closed write-readback + standalone `postAdoptionReadback` tamper detection (test) |

## Governance posture (spec 12.3/13.4)

- Frontdoor admission is a mandatory complement, never replaced by behavioral evidence (both are bound, both are required).
- Eval PASS is evidence, never authority; approval is a gate, never a permission; `authority_granted` is `const false` at the schema level.
- The improvement loop cannot self-approve: the only legal approver value is `canonical_owner`.
- An actual promotion on the live canonical skill tree remains an owner act; this run materialized the mechanism and proved it in isolated temp trees only.

## Verification

- `node --test tests/vnext/*.test.mjs` — 406/406 PASS (includes the 9 new S8 tests).
- `npm run eval:maws-vnext` — ok:true (promotion fixture included).
