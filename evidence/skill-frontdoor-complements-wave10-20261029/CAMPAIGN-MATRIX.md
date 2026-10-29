# Complement Campaign — Closing Matrix (round 9, 2026-10-29)

Class: evidence (campaign closing record). All 13 complement groups from the PR-#79 A/B mapping and the Skill_Deep_Review_135 report. Merging any PR remains an owner adoption act; `ELIGIBLE` never grants authority.

| # | Group (skill) | PR (head, stacked in order) | Implementation | Tests | Merge status | Remaining items |
|---|---|---|---|---|---|---|
| 1 | api-contract-review | #115 (`f5c5fbf`) | frontdoor CLEAN/ELIGIBLE, byte-identical commit | battery green at push time (frozen) | OPEN, ready | owner merge |
| 2 | authorization-boundary-review | #115 (`f5c5fbf`) | same | same | OPEN, ready | owner merge |
| 3 | data-access-performance-review | #115 (`f5c5fbf`) | same | same | OPEN, ready | owner merge |
| 4 | frontend-performance-review | #116 (`d4e5f9f`) | frontdoor CLEAN/ELIGIBLE | battery green at push time (frozen) | OPEN, ready | owner merge |
| 5 | state-consistency-review | #116 (`d4e5f9f`) | same | same | OPEN, ready | owner merge |
| 6 | research-reproduction-review | #117 (`aa43f09`, owner-advanced: 57ba7ea routing qualification + aa43f09 registry binding) | owner work + prior wave-3 base | owner's own closure tests (research-selection test file) | OPEN, ready | owner merge |
| 7 | search-discoverability-review (rank 4) | #118 (`b65983a`) | consolidated onto `aa43f09`; impl `9a3417b`; disposition re-bound | checker 24/24 · fixture 7f2a952e (43) · test:vnext 847/847 · requalify 6/6 no-op | OPEN, MERGEABLE | owner merge |
| 8 | user-research-plan (rank 5) | #119 (`6cbb794`) | consolidated; impl `ed0e4d1`; provenance fixes (4d210ef lineage) preserved | checker 27/27 · fixture 3faba369 (44) · 847/847 | OPEN, MERGEABLE | owner merge |
| 9 | social-publication-preflight (rank 6) | #120 (`58402b6`) | consolidated; impl `6d713da`; provenance fixes (1fae897 lineage) preserved | checker 30/30 · fixture 60e7cf6e (45) · 847/847 | OPEN, MERGEABLE | owner merge |
| 10 | brand-asset-brief (rank 7) | #121 (`a8a7a63`) | consolidated; impl `19bbb98` | checker 33/33 · fixture f958f626 (46) · 847/847 | OPEN, MERGEABLE | owner merge |
| 11 | media-production-brief (rank 8) | #122 (`6d7bfef` incl. stack-consolidation record) | consolidated; impl `c4c7fa6` | checker 36/36 · fixture bbc4d035 (47) · 847/847 | OPEN, MERGEABLE | owner merge |
| 12 | content-evidence-editor (rank 10) | #123 (`63a4c96`) | first-pass CLEAN/ELIGIBLE; impl `85b3cb9` | checker 39/39 · fixture 5334fa63 (48) · 847/847 · evals 27/27 · ci-gate PASS | OPEN, draft | owner merge |
| 13 | marketing-strategy-plan (rank 9) | #124 (`5cec96c`) | placement reassessed (axes separated); first-pass CLEAN/ELIGIBLE; impl `b751cb0` | checker 42/42 · fixture 41e8d3d1 (49) · 847/847 · evals 27/27 · ci-gate PASS | OPEN, draft | owner merge |

## Valid merge order

`#115 → #116 → #117 (aa43f09) → #118 → #119 → #120 → #121 → #122 → #123 → #124` — strictly sequential; each branch tip is a descendant of its predecessor's tip (round-9 consolidation, `evidence/stack-consolidation-20261029/RECORD.md` on #122). After any early merge the remaining stack needs no rebase.

## Provenance standard (round 9, applied to waves 4–10)

Outputs are agent-executed and labeled per file: VERBATIM_NEVER_EDITED only where a recording of the original output exists (single-version git history or verbatim-committed re-execution), else EDITED_AFTER_EXECUTION (loss documented) or NOT_INDEPENDENTLY_VERIFIED; every verbatim claim is bounded by executing-agent attestation plus transcript corroboration. Hashes prove identical stored bytes; a green checker proves fulfilled assertions; execution claims rest on recorded invocation metadata plus the session transcript. Wave 4 was retrofitted (execution record + verbatim re-executions under `reexec/wave4/`).

## Explicitly open (not closed by this campaign)

1. **Owner merge sequence** (#115 → #124) — the only authority step; `ELIGIBLE` grants nothing.
2. **Mimosa full scan** — the scanner could not produce complete verdicts on these MAWS commits (library_source / library_source_limit_exceeded, callgraph partial). All commits were made under the documented compatibility pass; **no project-safety claim is made**; a full re-scan is owed.
3. **Root stub follow-ups (organic, owner-owned)**: `skills/writing.md` and `skills/strategy.md` stay session postures; one narrowed owner decision remains — whether the matured root strategy stub should later reference or complement core `marketing-strategy-plan`.
4. **Third-party import track** — unchanged; license clearance + per-candidate fixes + re-scan of changed identity, separate from native authoring (which is now complete for all 13 groups).
