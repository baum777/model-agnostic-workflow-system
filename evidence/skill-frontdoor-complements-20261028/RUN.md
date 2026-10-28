# Skill Frontdoor Complements 2026-10-28 — Run Record

Class: evidence (sanitized summary; raw receipts stay in the private workspace ledger).
Use rule: admission evidence only. `ELIGIBLE` grants no authority; merging this branch remains an owner adoption act.

## Scope

Three native review skills were authored against the complement proposals recorded in the
private baum-os A/B mapping (PR baum777/baum-os#79, `docs/skills/skill-issue-ab-20261027.md`),
staged without activation, and admitted through the canonical skill frontdoor:

| Skill | Admission ID | Analysis | Implementation | Blockers |
|---|---|---|---|---|
| `api-contract-review` | `sfa_0f8c29bd6096_20261028T063003.208Z` | CLEAN | ELIGIBLE | none |
| `authorization-boundary-review` | `sfa_2739ccb38ec8_20261028T063010.434Z` | CLEAN | ELIGIBLE | none |
| `data-access-performance-review` | `sfa_f1fcf8f9a7a5_20261028T063018.049Z` | CLEAN | ELIGIBLE | none |

Analyzers: NVIDIA/SkillSpector 2.12.0 (`--no-llm`, complete, recommendation SAFE) and
NVIDIA/SkillEvaluator 0.3.0 (`--external --tiers 1 --min-score 70`, overall passed).
Per-candidate records: `admission-summary.json` (local absolute paths removed for the
public repository; the unmodified receipts remain in the private workspace ledger).

The committed `core/skills/<id>/SKILL.md` files are byte-identical to the admitted
staged candidates (content digests in `admission-summary.json`).

## Authoring boundaries observed

- Frontmatter contract-path fields were omitted: the MAWS-conventional repo-relative
  frontmatter paths (`core/contracts/...`) do not resolve inside a standalone staged
  candidate and force SkillSpector `reference_resolution` to `partial`/INCOMPLETE.
  Machine-readable bindings live in `core/contracts/portable-skill-manifest.json`
  (documented extension flow in `core/skills/README.md`). This also explains the
  historical `reference_missing` INCOMPLETE results in the 2026-09-28 admission run.
- Sibling skills are cited by name only (no `.../SKILL.md` path literals), which keeps
  the static agent-snooping/skill-enumeration signals at zero.
- `metadata.author` is required by SkillEvaluator's external profile; the flat MAWS
  frontmatter parser tolerates the nested block.

## Coordinated re-pin chain (enlarged skill registry: 36 -> 39 snapshot skills)

Executed end to end following the precedent of commit `4b57ff3`
(`evidence/boundary-closure-2026-10-22/RUN.md`):

| Surface | Change |
|---|---|
| `runtime/cli/specs/reference-audit-v1.json` | `requalify-run-spec.mjs --write`, `5bd3d8cd` -> `7b96d25b` |
| `runtime/harness-context/profiles/model-adaptive/profiles/*.json` (6) | instruction digest `95dd981a` -> `41ab86fd` |
| `tests/vnext/executor-model-profile.test.mjs` | committed `PINNED_DIGEST` re-pinned |
| `evals/fixtures/maws-vnext/executor-model-profile.contracts.json` | 29 pinned digest strings updated; fingerprints unchanged (validated) |
| `evals/experiments/ho01-local-optimization/experiment.json` | frozen spec digest `91612fde` -> `6cfa2305` |
| `evidence/local-optimization-comparison-2026-10-21/` | comparison re-executed and re-frozen; verdict unchanged (`IMPROVEMENT_REJECTED`); hand-maintained `RUN.md` and `registry-disposition.json` preserved unchanged |
| `evals/fixtures/maws-vnext/skill-selection.contracts.json` | two runtime-output cases regenerated from the live selector (snapshot digest `e6c514b2`, 39 skills) |

## Validation evidence (all after the final state)

- `npm run test:vnext`: **844/844 pass** (baseline at `5a7f660`: 844/844)
- `npm run test:skill-frontdoor`: 6/6 pass
- `npm run test:merge-executor`: 89/89; `npm run test:merge-attestation`: 34/34
- `npm run validate`, `validate-neutral`, `validate-maws-vnext`: 0 issues
- `npm run detect-skill-overlap`: 0 findings; `lint-skill-contracts`: 0 errors, 0 findings on the new skills
- `npm run analyze-skill-tree-coverage`: no limit violations
- `npm run eval:maws-vnext` (27), `eval:secret-boundary` (5), `eval:provider-export-alignment` (1): all pass
- `npm run validate-experiment-comparison`: valid; `npm run baum:ci-gate`: PASS

## Not claimed

- No adoption, activation, runtime authority, publication, or submodule pin change.
- Tier 2 semantic-overlap and Tier 3 live evaluation remain downstream evidence.
- The three skills are prose workflow skills; no executable surface was added.

## Independent review round (2026-10-28, second pass)

**Admission vs. promotion terminology.** `CLEAN/ELIGIBLE` is a *frontdoor admission*
result (gate term; `admission_id`): the candidate is eligible to continue and nothing
more — `authority_granted` is false by construction and re-derivation confirmed
declared == derived for all three records. *Adoption* is the owner merge of this PR.
The formalized S8 promotion chain (`promote-skill-candidate`, append-only adoption
ledger, owner-approval anchor) is a PROPOSED, unchecked slice of
MAWS-SII-TARGET-SPEC-001 v0.2.0; no adoption ledger exists in the repository and the
18 pre-existing core skills were all added through regular reviewed commits (e.g.
`4ac387e`, `e292cb3`). This PR follows that same de-facto path plus the PR-#79 gate
sequence. If/when S8 becomes binding, these three skills belong in its grandfather
class or need a retroactive ledger formalization — recorded here so the distinction
survives the merge.

**Re-verification performed (independent of the implementing session):**

- Admission records: schema-valid (0 issues), dispositions re-derived from evidence
  (CLEAN/ELIGIBLE, identical), `authority_granted: false`; committed `SKILL.md`
  content digests re-hashed and equal to the admission `content_digest`.
- Raw analyzer reports: SkillSpector 2.12.0 `execution_successful: true`,
  `is_complete: true`, risk LOW score 0, recommendation SAFE, **0 issues** each;
  SkillEvaluator 0.3.0 `overall_status: passed`, `overall_passed: true`, 0 errors
  (7–10 non-blocking warnings each).
- Delta review vs `5a7f660`: core registry purely additive (3 skills added, none
  dropped, tool set unchanged); all provider exports carry the new skills; routing-map
  diff is exactly the four intended entries; all re-pin surfaces are digest-only
  substitutions; HO-01 hand-maintained `RUN.md` and `registry-disposition.json`
  byte-identical to their pre-regeneration state (only regenerated bundles replaced).
- `skill-selection.contracts.json` now intentionally mixes two fixture classes:
  2 runtime-reproduction cases regenerated against the current 39-skill snapshot
  (digest `e6c514b2…`), 24 cases frozen at the historical snapshot (digest
  `e7bed984…`) whose derived `selection_id`/`evidence_digest` values remain internally
  consistent with that snapshot — rewriting them would turn valid records into
  hand-written variants, and the invalid cases are crafted schema violations by
  design. Tests remain 844/844.

**Behavior checks.** Ten targeted cases (3 positive, 7 negative, including the
DR-019 and DR-020 classes as dedicated negative fixtures) executed by the reviewing
agent over committed inputs; outputs verified by a committed checker
(`behavior/check-behavior.mjs`, exit 0, `results.json`) for required output-contract
sections, case-specific findings/verdicts, and the *absence* of normalization
language and fabricated analyzer output. Mutation-probed: injected acceptance
language flips exactly the targeted case to FAIL; restore returns 10/10. This is
reviewer-executed verification, not an S5 behavioral-eval record and not Tier 3 —
see `behavior/README.md`.

**Case-count reconciliation.** A transient planning note in the authoring session
said "9 cases"; every committed layer (case inputs, outputs, checker `CASES`,
README, RUN.md, results) carries exactly **10** (3 positive, 7 negative — the
authorization group received three negative fixtures: DR-019, DR-020, and the
default-deny inversion). The checker now enforces the 1:1 enumeration
(inputs ↔ outputs ↔ declared cases) structurally: any drift exits 2 with a
mismatch report; `results.json` records `coverage.one_to_one: true`.

**Mimosa sealed deep scan (mandatory-check completion).**
Scan `scan-2026-10-28T11-20-35.724Z-4fb8aac38047`, seal
`sha256:18e0c6e8…`, depth deep, run over this worktree: **0 findings and 0
business-logic candidates in the reviewed scope**; dependencies: 201 packages
scanned, offline advisory matched 3 packages / 3 advisories. Separately recorded
technical limits (not findings): the pipeline reviewed 35 of 25,168 files with 0
read/parse failures (selection list not exposed, so delta coverage is not
independently confirmable), a declared call-graph completeness gap, and
`runStatus: inconclusive` by the scanner's own contract — no full-coverage clean
bill is claimed. Record: `mimosa-scan-record.json`.

**CI note.** `loop-repo-ci` fails identically on `main` and every branch since
2026-10-23 (job never starts: empty runner, no steps, no logs) — a pre-existing
environmental failure (documented account-level Actions suspension), not caused by
this PR; GitHub reports the PR `MERGEABLE`.
