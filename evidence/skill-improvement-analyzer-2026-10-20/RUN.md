# RUN — Skill Improvement Analyzer 2026-10-20 (SII implementation slice S4)

**Run ID:** skill-improvement-analyzer-2026-10-20
**Date:** 2026-10-20
**Baseline:** `origin/main` = `7a56a972bb388abe70c6a6e35c91b16955e7e468` (Merge PR #42, S11 harness-context separation) — the worktree was created detached from that commit.
**Spec basis:** `docs/proposals/skill-intelligence-target-spec.md` (`MAWS-SII-TARGET-SPEC-001` v0.2.0, PROPOSED), sections 8.3 (error classes), 8.4 (reuse/extend/create gate), 9 Stage 2 (Diagnose) and Stage 3 (Proposal), 14 (proposed artifacts) and 15 (slice S4).
**Authority posture:** contract + pure analysis runtime. A proposal is analysis output, never authority: it grants no permission, promotes no skill, activates no runtime path and changes no qualification state. `authority_granted` is `false` by construction. Stage 4 (candidate evaluation), Stage 5 (governance review) and Stage 6 (promotion) are NOT implemented by this slice; Stage 8 (S8) remains the promotion lane.

## 1. The Gap This Slice Closes

`Observed`: the spec's 7-stage feedback-to-improvement lifecycle had Stage 1 (capture) implemented as `core/contracts/skill-feedback.schema.json` (S1), Stage 4 (candidate evaluation) implemented as `core/contracts/behavioral-eval.schema.json` (S5), and Stages 5/6 (promotion) in flight as S8. Stage 2 (Diagnose) and Stage 3 (Proposal) had **no implementation at all**: `runtime/skills/` contained only `frontdoor.mjs`, and `core/contracts/skill-improvement-proposal.schema.json` did not exist. Without Stage 2 and Stage 3 nothing can turn a captured feedback record into a reviewable improvement candidate, so the lifecycle stops at capture.

## 2. Scope

1. New canonical contract `core/contracts/skill-improvement-proposal.schema.json` (schema_version `1.0.0`).
2. New runtime module `runtime/skills/feedback-analyzer.mjs` — Stage 2 Diagnose.
3. New runtime module `runtime/skills/improvement-classifier.mjs` — Stage 3 Proposal, plus `buildSkillUniverse` (the only filesystem adapter of the slice).
4. Validator CLI `scripts/tools/validate-skill-improvement-proposal.mjs` + npm script `validate-skill-improvement-proposal`.
5. Fixture `evals/fixtures/maws-vnext/skill-improvement-proposal.contracts.json` (6 positive / 10 negative cases), registered in `evals/catalog.json` (covered by `eval:maws-vnext` and `validate-maws-vnext`).
6. Tests `tests/vnext/skill-improvement.test.mjs` (29 tests, picked up by `test:vnext`).
7. `core/contracts/README.md` (canonical file list + prose), `evals/README.md`, `CHANGELOG.md`, this run record and the registry disposition.

**Out of scope (deliberately):** `core/contracts/skill-effectiveness-report.schema.json` (S5 candidate-effectiveness report), a diagnosis contract, `core/contracts/portable-skill-manifest.json`, `core/skills/`, `providers/`, `core-registry.json` and the provider export artifacts. The Stage-2 diagnosis record stays a runtime record; S4 registers exactly one new contract.

## 3. Contract Shape And Why

| Field | Shape | Why |
|---|---|---|
| `proposal_id` | `sip_[a-z0-9_]+` | deterministic function of feedback id, diagnosis id, decision and change scope, so re-running the classifier on unchanged inputs reproduces the id (same posture as the S3 `finding_id`). |
| `feedback_ref` | `{feedback_id, feedback_schema_version, source_ref}` | binds the proposal to the S1 record it was derived from; `source_ref` reuses the S1 closed source-kind scheme, so model self-report cannot appear as a locator either. |
| `diagnosis_ref` | `{diagnosis_id, diagnosis_schema_version}` | makes the Stage-2 → Stage-3 chain reconstructable. |
| `error_class` | `$ref` into `skill-feedback.schema.json#/properties/error_class` | the carried-forward §8.3 class comes from the S1 taxonomy by reference, so the two vocabularies cannot drift apart. |
| `responsible_area` | `skill \| instruction \| routing \| validator \| runtime \| tool_contract \| null` | §8.3: "the error class determines the responsible improvement area". `null` means no area is attributed (unattributed cause) — a proposal never names a guessed owner. |
| `decision` | `REUSE \| EXTEND_SKILL \| CREATE_SKILL \| NO_CHANGE \| NEEDS_MORE_EVIDENCE` | the closed §8.4 reuse/extend/create gate. Promotion, application and the `REPAIR_*` dispositions are not proposals; promotion stays a governance decision (§13.4). |
| `target_skill_ref` | skill instruction path under `core/skills/`, `skills/` or `.agents/skills/` | present only for `REUSE` and `EXTEND_SKILL`; every other decision forbids it, so a proposal can never carry a skill target it does not act on. |
| `change_scope` | `{surface, summary, paths}` | `surface` is `none` or `skill_instruction_file`; `paths` is bounded to 8 entries; a decision that requests no change carries `surface: none` and an empty path list. The exact scope is the DoD requirement ("exakten Änderungsscope"). |
| `evidence_refs` | closed scheme, `minItems: 1` | a proposal without evidence cannot be reconstructed later; the scheme set is closed exactly as in S1, so self-report is structurally excluded. No upper bound is set here, because a truncated evidence set would silently drop anchors. |
| `candidate_evaluation` | `{universe_ref, universe_digest, candidates_considered, rejected_candidates}` | the §8.4 gate must be inspectable: which candidates were consulted, which were rejected and why. The digest makes the consulted universe reconstructable. |
| `requires_owner_review` | boolean | forced by the fail-closed rules below. |
| `authority_granted` | `const false` | a proposal is never authority. |

### Fail-closed rules encoded in the contract

1. The error class determines the responsible area (closed, total mapping; `UNKNOWN_ROOT_CAUSE` → `null`). A mismatching pair fails closed.
2. `CREATE_SKILL` and `EXTEND_SKILL` ⇒ `requires_owner_review: true` (S1 precedent, F-22-1/§8.4).
3. `UNKNOWN_ROOT_CAUSE` ⇒ `requires_owner_review: true` (S1 precedent).
4. `decision: NEEDS_MORE_EVIDENCE` ⇒ `requires_owner_review: true`.
5. A cause that lies exclusively in the tool contract or in the runtime can never carry a skill-changing decision (`EXTEND_SKILL`/`CREATE_SKILL` are excluded for every non-skill area, including `tool_contract` and `runtime`).
6. `target_skill_ref` exists only for `REUSE`/`EXTEND_SKILL`; `change_scope.surface` is `none` for every decision that requests no change.

## 4. The Skill Universe And The Manifest Gap

**Decision (as directed):** the classifier resolves candidates against the **instruction inventory's** skill universe — all three declared skill trees — and records the portable-skill-manifest gap explicitly instead of hiding it.

**Reasoning, observed on the baseline tree:**

- `core/contracts/portable-skill-manifest.json` `skills[]` lists exactly the 18 `core/skills/` skills and nothing else.
- `skills/` holds 19 further skills and `.agents/skills/` holds 3 more; none of them is in the manifest.
- `runtime/instructions/instruction-inventory.mjs` (S2) already enumerates all three trees as declared instruction sources, and the repo root contract lists `skills/` among the canonical reusable surfaces — so the *instruction* universe is complete, the *manifest* universe is not.
- `core/contracts/portable-skill-manifest.json` was **not** extended by this slice. Its `activationPolicy.expectedDistribution` (`modelagnostic-autonomous: 17`, `explicit-user-call-required: 1`) is checked by `npm run validate-neutral` and by `eval:provider-export-alignment`, and changing it is an owner decision that would also change the 18/1 distribution.

**Handling:** a candidate that is a known skill instruction file but is not registered in the portable skill manifest is rejected with the reason `NOT_IN_PORTABLE_SKILL_MANIFEST` and recorded in `candidate_evaluation.rejected_candidates`. It can never be selected, and it never disappears unnoticed. Candidates that are not skill instruction files at all are rejected with `NOT_IN_SKILL_UNIVERSE`; a candidate without evidence refs is rejected with `NO_COVERAGE_EVIDENCE`.

**Consequence, stated plainly:** with the manifest as it stands, only the 18 manifest skills are eligible as `REUSE`/`EXTEND_SKILL` targets. The other 22 skills remain visible in the universe and permanently rejected until the owner decides on the manifest.

## 5. Stage 2 — Diagnose (`runtime/skills/feedback-analyzer.mjs`)

- `analyzeFeedback({feedback, root, evidence, now})` validates the feedback record against the canonical S1 contract first (`FEEDBACK_CONTRACT_INVALID` on a violation), then derives the diagnosis. `deriveDiagnosis(...)` is the pure variant for an already-validated record.
- The Stage-2 checklist of spec §9 is modelled as evidence facts: `skill_active`, `instruction_loaded`, `context_present`, `reproducible`, `attribution` (`model|skill|tool|harness|validator|unattributed`).
- Precedence: a proven cause location wins over the captured class; the Stage-2 checks win over an unproven capture; the captured class is the last resort. The analyzer never invents a class it cannot point at.
- `UNKNOWN_ROOT_CAUSE` ⇒ `inferred_cause: null`, `confidence: low`, `requires_owner_review: true` (fail-closed, no guessed cause).
- A carried-forward class is labelled as such in the cause statement ("carried forward from the captured feedback record without contradicting run evidence: …") so a capture is never restated as a fresh finding.
- Fail-closed: `FEEDBACK_EVIDENCE_MISSING` (no evidence ref), `FEEDBACK_SCHEMA_VERSION_UNSUPPORTED`, `DIAGNOSIS_CHECK_INVALID`, `DIAGNOSIS_ATTRIBUTION_INVALID`, `EVIDENCE_REF_INVALID` (a ref outside the closed scheme).

## 6. Stage 3 — Proposal (`runtime/skills/improvement-classifier.mjs`)

- `classifyImprovement({diagnosis, feedback, skill_universe, coverage_evidence, pattern_evidence, new_skill_ref, now})` is a **pure** function over the skill universe: no filesystem, no network, no clock of its own (the timestamp is injected). `buildSkillUniverse({root})` is the only adapter that reads the repository, and it reads through the canonical S2 instruction inventory.
- The §8.4 gate order is: existing skill sufficient (`REUSE`) → existing skill extendable (`EXTEND_SKILL`) → reusable pattern proven (`CREATE_SKILL`) → no new skill (`NO_CHANGE`). Missing evidence blocks (`NEEDS_MORE_EVIDENCE`) and never produces a guessed cause.
- A reusable pattern must be **proven by recurrence** (`recurrence_count >= 2` plus evidence refs): a one-off correction never justifies a new skill (spec §8.4). A proven pattern without a bounded target path stops at `NEEDS_MORE_EVIDENCE` instead of guessing a file name.
- The candidate relations (`covers`, `extendable`) are **evidence-backed signals supplied by the caller**; the classifier resolves them against the universe and the manifest and never invents a coverage claim on its own. This keeps the "does an existing skill already cover this?" question anchored in evidence instead of in a fuzzy text match.
- `REUSE` is admissible only where the cause is a matter of which skill applies (areas `skill` and `routing`); for every other area the skill surface is not changed.
- Fail-closed: `DIAGNOSIS_REQUIRED`, `DIAGNOSIS_EVIDENCE_MISSING`, `DIAGNOSIS_ERROR_CLASS_INVALID`, `DIAGNOSIS_CONFIDENCE_INVALID`, `SKILL_UNIVERSE_EMPTY`, `SKILL_UNIVERSE_DIGEST_MISSING`, `FEEDBACK_BINDING_MISMATCH`, `COVERAGE_SKILL_REF_INVALID`, `COVERAGE_RELATION_INVALID`, `COVERAGE_EVIDENCE_TOO_MANY`, `EVIDENCE_REF_INVALID`.

## 7. Owner Decisions Named By This Slice

These are decisions the slice made conservatively and that the owner may overrule. Each is implemented in the conservative direction.

1. **Portable skill manifest extension (not done here).** The 22 skills outside `core/contracts/portable-skill-manifest.json` are permanently rejected as proposal targets until the owner extends the manifest. The manifest carries a checked `activationPolicy.expectedDistribution`, so extending it is an owner decision with a provider-export consequence. *Owner action:* decide whether the manifest should cover all three instruction trees, or whether the S4 gate should read a different registration surface.
2. **`responsible_area` is nullable.** The task's six values are the complete vocabulary for an *attributable* cause; `null` is the explicit "not determined" marker bound to `UNKNOWN_ROOT_CAUSE`. The alternative — forcing one of the six values onto an unattributed cause — would name a guessed owner, which contradicts "it never guesses a cause". *Owner action:* confirm `null` (or confirm a seventh explicit value such as `unattributed`).
3. **`REUSE` inside the non-skill areas.** The S1 contract keeps `REUSE` admissible for a `TOOL_CONTRACT_ERROR` record, and the proposal contract mirrors that (a `REUSE` proposal changes no skill). The runtime classifier is stricter: it only emits `REUSE` for the `skill` and `routing` areas, and produces `NO_CHANGE` for a tool-contract or runtime cause. *Owner action:* confirm the stricter runtime rule, or relax it to the contract envelope.
4. **The diagnosis record is not a registered contract.** S4 registers one contract (the proposal). The Stage-2 diagnosis is a runtime record with a deterministic id. *Owner action:* decide whether a `skill-diagnosis.schema.json` belongs to a later slice.
5. **Slice-name collision (documentation only).** `docs/proposals/skill-intelligence-reconciliation-map-2026-10-20.md` uses "S4" for the *wave-A instruction reduction* across four repositories, while the spec's slice S4 is the *Skill Improvement Analyzer*. Both are named in this record; no reconciliation-map change was made (out of scope).
6. **Baseline drift during the run.** The worktree was created from `origin/main` = `7a56a97`; `origin/main` advanced to `2cd0edcc` (S11 harness-context consolidation + disposition rebind) while this slice was in flight. `git diff --name-only 7a56a97 origin/main` shows no overlap with any file of this slice, so the change rebinds onto the current main without conflict — but the rebind itself was not performed here.

## 8. Verification Performed

All commands were run from the worktree root.

| Command | Result |
|---|---|
| `npm run validate` | PASS (`issueCount: 0`) |
| `npm run validate-neutral` | PASS (`issueCount: 0`) |
| `npm run validate-maws-vnext` | PASS (`"ok": true`, no issues) |
| `npm run eval:maws-vnext` | PASS — 16 fixtures, `passed: 16`, `failed: 0` (15 before this slice; the new `maws-vnext-skill-improvement-proposal-contracts` fixture is registered and green) |
| `npm run validate-skill-improvement-proposal` | PASS — `skill-improvement-proposal fixture: 16 cases checked, 0 unexpected results` |
| `npm run test:vnext` | **415 tests, 415 pass, 0 fail** (baseline before the change: **386 tests, 386 pass, 0 fail**; +29 from `tests/vnext/skill-improvement.test.mjs`) |
| `node --check` on the three new `.mjs` files | PASS |

## 9. Mutation Evidence (guards proven to bite)

Each mutation was applied with the Edit tool, the failure was observed, and the guard was restored afterwards. The restored state was re-verified: fixture validator `16 cases checked, 0 unexpected results`, `tests/vnext/skill-improvement.test.mjs` 29/29, `test:vnext` 415/415.

**Mutation 1 — classifier: drop the area guard on skill extension** (`runtime/skills/improvement-classifier.mjs`, `responsibleArea === 'skill' && extendable.length > 0` → `extendable.length > 0`):

```
✖ the P2 repair scenario: a tool-contract cause never changes the skill surface (4.316803ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected

  + 'EXTEND_SKILL'
  - 'NO_CHANGE'
ℹ tests 29
ℹ pass 28
ℹ fail 1
```

**Mutation 2 — analyzer: drop the missing-evidence fail-closed** (`runtime/skills/feedback-analyzer.mjs`, the `FEEDBACK_EVIDENCE_MISSING` guard):

```
✖ a missing evidence ref fails closed (1.803005ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
ℹ tests 29
ℹ pass 28
ℹ fail 1
```

**Mutation 3 — contract: drop `CREATE_SKILL` from the owner-review rule** (`core/contracts/skill-improvement-proposal.schema.json`):

```
case skill-improvement-invalid-create-skill-without-owner-review: expected failure but observed pass: (no issues)
skill-improvement-proposal fixture: 16 cases checked, 1 unexpected results

✖ every fixture case validates exactly as declared (8.335233ms)
  AssertionError [ERR_ASSERTION]: skill-improvement-invalid-create-skill-without-owner-review must fail but passed
ℹ tests 29
ℹ pass 27
ℹ fail 2
```

The four required mutation observations are covered by these three mutations:

- **P2 repair scenario** (tool-contract cause ⇒ `decision: NO_CHANGE`, no skill-changing target): mutation 1 shows the guard biting; the unmutated test asserts `NO_CHANGE`, no `target_skill_ref`, `change_scope.surface: none`.
- **`CREATE_SKILL` ⇒ `requires_owner_review: true`**: mutation 3 shows the contract rule biting; the classifier test additionally asserts it on the emitted proposal.
- **`NEEDS_MORE_EVIDENCE` when the evidence is insufficient, never guessing a cause**: asserted by the test "insufficient evidence stops at NEEDS_MORE_EVIDENCE and never guesses a cause" (`inferred_cause: null`, `responsible_area: null`, no target).
- **A missing evidence ref fails closed**: mutation 2 shows the analyzer guard biting; the classifier guard (`DIAGNOSIS_EVIDENCE_MISSING`) and the contract guard (`evidence_refs` `minItems: 1`) are asserted separately.

## 10. Results And Open Items

- The 7-stage lifecycle now has Stage 2 and Stage 3 implemented: a validated S1 feedback record becomes a Stage-2 diagnosis (proven §8.3 class, cause, confidence) and, with evidence-backed candidate signals, a bounded Stage-3 proposal that names the proven cause, the responsible owner and the exact change scope.
- Registry consequence: one new canonical contract ⇒ `CONTRACT_RECORD` class change ⇒ `registry_relevant_change: true`, `status: REQUIRED_BUT_BLOCKED` (the Unitera-registry write is its own registered change; it is not performed by this slice). See `registry-disposition.json`.
- Open items:
  - Unitera-registry `CONTRACT_RECORD` write for `core/contracts/skill-improvement-proposal.schema.json`, then rebind of this disposition to `UPDATED` with the registry `registry_commit_sha` (own gated change, two-phase pattern as in S1).
  - Owner decision 1 (manifest extension) gates how many skills can ever be proposal targets.
  - Stage 4/5/6 remain unimplemented here; the behavioral improvement proof stays S5, the promotion decision stays S8.
  - `implementation_commit_sha` in the disposition is a placeholder: the change is deliberately left uncommitted in the worktree and must be bound to the landing commit.
