# RUN — SII Materialization 2026-10-20 (MAWS-SII-TARGET-SPEC-001)

**Run ID:** sii-materialization-2026-10-20
**Date:** 2026-10-20
**Trigger:** owner directive ("starte die materialisierung / implementierung") following the completed S0 reconciliation of the same day.
**Authority posture:** proposal staging only. Nothing in this run creates authority, qualification, permission, or runtime activation. `docs/proposals/README.md` and Section 21 of the specification itself both require a separate owner-approved promotion/adoption slice before any canonical effect.

## Scope

1. Materialize the owner-provided target specification `MAWS-SII-TARGET-SPEC-001` v0.1.0 (PROPOSED) verbatim as `docs/proposals/skill-intelligence-target-spec.md`. The body is byte-verbatim owner input; the only edits are removal of one leading blank line and an appended, clearly delimited Materialization Note.
2. Materialize the S0 current-state reconciliation as `docs/proposals/skill-intelligence-current-state-map-2026-10-20.md` (evidence-backed map; baseline pinned to `origin/main` `dcd95bf2d1d5a811bfd81026e943e3c2d0e7a072`).
3. Record this run and the registry disposition.

Out of scope (follow-up slices, each with its own gates): implementation slices S1+ of the target spec; any promotion of the proposal into canonical docs; any registry write.

## Source Provenance

- Specification text: owner-provided document dated 2026-10-20 (Document ID `MAWS-SII-TARGET-SPEC-001`, Version 0.1.0, Status `PROPOSED — TARGET SPECIFICATION`).
- Current-state evidence: read-only verification against `origin/main` = `dcd95bf2d1d5a811bfd81026e943e3c2d0e7a072` (git tree reads: `git cat-file`, `git grep`, `git show`; no worktree mutation).

## Placement Decision

`docs/proposals/` is the repository's established non-canonical staging area ("proposal target / docs-only / non-canonical docs staging", promotion only via "a separate owner-approved promotion slice"). This matches Section 21 of the specification (canonical adoption requires an independent owner/repository adoption step).

## Verification Performed

- Spec copy read back: 1248 content lines + materialization note; title, Document ID and trailing `End of Target Specification` intact.
- S0 map: 18/18 baseline components confirmed, 6/6 extension gaps confirmed with file/line evidence, 16/16 proposed paths collision-free, 6/6 existing npm commands present, frontdoor fail-closed wiring confirmed.
- `npm run validate` (repo surface), `npm run validate-neutral`, `npm run validate-maws-vnext`, `npm run test:vnext` executed on the change worktree — see disposition `validation` entries for the recorded results.
- Disposition validated with the canonical validator: `node scripts/tools/validate-registry-disposition.mjs evidence/sii-materialization-2026-10-20/registry-disposition.json`.

## Results

- PR: docs-only materialization wave (spec + S0 map + this run record), two-commit structure (implementation commit, then disposition commit binding `implementation_commit_sha`).
- Disposition: `NO_CHANGE` / `material_change: true` / `registry_relevant_change: false` — proposal staging alters no closed-taxonomy class (no CONTRACT_RECORD, PROVENANCE or SUPERSESSION surface created; the staged spec is non-authoritative by construction).

## Open Items

- Implementation slices S1 (Feedback Contract) and S2 (Instruction Inventory) are the next gated steps per the S0 map §9.
- The stale primary checkout (`d6a8fdd`, 44 dirty entries) still needs its own separate disposition by the owner.
