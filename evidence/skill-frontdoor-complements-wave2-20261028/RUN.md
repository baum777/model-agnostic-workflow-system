# Skill Frontdoor Complements Wave 2 — 2026-10-28 — Run Record

Class: evidence. Stacked on `session/skill-complement-integration-20261028` (`f5c5fbf`);
base `main` still `5a7f660`. Use rule: admission evidence only; `ELIGIBLE` grants no
authority; merging remains an owner adoption act.

## Scope

Second integration slice per the baum-os complement priorities
(`docs/skills/skill-complement-priorities-20261028.md`, ranks 1–2):

| Skill | Admission ID | Analysis | Implementation | Blockers |
|---|---|---|---|---|
| `frontend-performance-review` | `sfa_330f1c1949cd_20261028T114342.906Z` | CLEAN | ELIGIBLE | none |
| `state-consistency-review` | `sfa_756779d735df_20261028T114350.573Z` | CLEAN | ELIGIBLE | none |

Both admitted **on the first frontdoor pass** — the wave-1 authoring conventions
(no repo-relative frontmatter paths, nested `metadata.author`, sibling citations by
name only) carried over. Committed `SKILL.md` files verified byte-identical to the
admitted candidates (content digests in `admission-summary.json`).

## Changes

- `core/skills/frontend-performance-review`, `core/skills/state-consistency-review` (+ contracts in the portable manifest, output contracts, verification-and-review routing class; README; activation expectation 20 -> 22; registry/provider exports regenerated).
- Instruction-digest re-pin chain (same deterministic sequence as wave 1): run spec `7b96d25b` -> `be3b1b04`, instruction digest `41ab86fd` -> `f850a6e5` (six profiles + test pin + 29 fixture strings), HO-01 experiment `6cfa2305` -> `d7f5e87d` with the comparison re-executed (verdict unchanged `IMPROVEMENT_REJECTED`; hand-maintained `RUN.md`/`registry-disposition.json` preserved byte-identical), skill-selection fixture regenerated from the live selector (snapshot `d646c171…`, 41 skills).

## Behavior checks

Extended the committed case set from 10 to **16** (2 positive, 4 negative for the new
skills): fabricated-profiling refusal (no evidence -> BLOCKED), claimed-but-unattached
audit numbers refused as narrative, optimistic update without recovery reported as a
finding, ambiguous three-writer ownership recorded with the server-authority default.
Checker 16/16, coverage closure inputs/outputs/declared 1:1 (`behavior/results.json`).

## Validation (final state)

`test:vnext` **844/844**; `test:skill-frontdoor` 6/6; merge suites 89/89 + 34/34;
`validate`/`validate-neutral`/`validate-maws-vnext` 0 issues; overlap 0 findings;
contract lint 0 errors / 0 findings on the new skills; evals 27/5/1 pass;
`validate-experiment-comparison` valid; `baum:ci-gate` PASS. (The eval runner needed
the repository `node_modules` on the resolution path — worktrees outside the repo tree
must link it; recorded here for future slices.)

## Not claimed

No adoption, activation, runtime authority, or Tier 2/3 evidence. This PR is stacked:
it must merge **after** PR #115; until then the diff against `main` visually includes
the wave-1 commits.
