# Skill Frontdoor Complements Wave 3 — 2026-10-28 — Run Record

Class: evidence. Stacked on `session/skill-complement-wave2-20261028` (`d4e5f9f`); base `main` still `5a7f660`. Use rule: admission evidence only; `ELIGIBLE` grants no authority; merging remains an owner adoption act.

## Scope

Third integration slice per the baum-os complement priorities (rank 3):

| Skill | Admission ID | Analysis | Implementation | Blockers |
|---|---|---|---|---|
| `research-reproduction-review` | `sfa_c159de88094d_20261028T115929.582Z` | CLEAN | ELIGIBLE | none |

Admitted on the first frontdoor pass; committed `SKILL.md` verified byte-identical to the admitted candidate. The skill converts deep-review case DR-002 (background runner bypassing sandbox/approvals by default) into an explicit execution-governance rule, exactly as waves 1–2 did for DR-019/DR-020.

## Changes

- `core/skills/research-reproduction-review` + contract bindings (portable manifest entry, discovery override, activation expectation 22 -> 23, output contract `research-reproduction-review-report-v1`); registry/provider exports regenerated (42 snapshot skills). No routing-map change — the nearest sibling `research-synthesis` is not wired into a workflow class either, and no misrouting is introduced.
- **Re-pin chain deliberately not triggered:** the effective instruction digest is unchanged by this slice (`41ab86fd`-family -> `f850a6e5` still matches; `requalify-run-spec --write` derived identical digests and was a no-op; experiment comparison stays valid). Only the skill-selection fixture required regeneration (snapshot `fdc16511…`, 42 skills). Recorded so future slices re-derive rather than assume.

## Behavior checks

Case set extended 16 -> **19** (1 positive, 2 negative): paper-with-artifacts -> bounded protocol with pre-agreed failure criteria and stated-vs-reproducible separation; claim-without-method -> BLOCKED, no invented "reproduction score"; overnight runner with sandbox/approvals bypass by default -> governance FINDING citing DR-002 with concrete amendments. Checker 19/19, coverage closure 1:1.

## Validation (final state)

`test:vnext` **844/844**; `test:skill-frontdoor` 6/6; merge suites 89/89 + 34/34; `validate`/`validate-neutral`/`validate-maws-vnext` 0 issues; overlap 0 findings; lint 0 errors / 0 findings on the new skill; evals 27/5/1 pass; `validate-experiment-comparison` valid (unchanged inputs); `baum:ci-gate` PASS.

## Not claimed

No adoption, activation, runtime authority, or Tier 2/3 evidence; no paper code or artifact executed anywhere in this slice. This PR is stacked: merge **after** PRs #115 and #116.

## Closure candidate follow-up — 2026-10-28 (not published)

The original 6df7163 state remains historical evidence. Its unchanged run-spec,
model-adaptive profile pins, experiment definition and comparison bindings were
read back against d4e5f9f. The original no-op is valid for those original inputs.

A real canonical-selector probe then exposed missing scope assignment: both
research review and synthesis were registered but had no ACTIVE scope. The local
closure candidate adds both to the existing verification-and-review class, without
adding a workflow class or changing admitted SKILL.md bytes. Three selector tests
cover reproduction selection, synthesis separation and missing-tool refusal.
Two independent DR-002 negatives retain approvals with sandbox disabled, and retain
sandbox with approval bypass. Together with the original combined bypass this
raises the structural reviewer-output set from 19 to 21. These are behavior-rule
checks, not technical enforcement, live agent evaluation or paper execution.

The new routing input invalidates the old no-op claim for this candidate. The
run-spec instruction digest is re-derived to 82c1c938…; the distinct model-adaptive
bundle digest is 0c70ac1e… (previously f850a6e5…). Exports, six profile pins,
fixtures and frozen experiment bindings are regenerated. The actual deterministic
HO-01 fixture comparison again reports IMPROVEMENT_REJECTED, not a research
reproduction or measured model improvement. Original hand-maintained HO-01 RUN.md
and Registry disposition remain unchanged; original generated bundles remain in
Git at 6df7163 and in the isolated historical archive.

Source review/CI/owner admission must bind a later published exact head; the local
closure candidate and green local checks are not independent PR acceptance.
