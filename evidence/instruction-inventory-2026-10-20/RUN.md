# RUN — Instruction Inventory 2026-10-20 (SII implementation slice S2, wave 1)

**Run ID:** instruction-inventory-2026-10-20
**Date:** 2026-10-20
**Baseline:** `origin/main` = `739b9c80a394c40639cb3d9043db757aca6df5d4` (Merge PR #22, SII slice S1)
**Spec basis:** `docs/proposals/skill-intelligence-target-spec.md` (`MAWS-SII-TARGET-SPEC-001` v0.1.0, PROPOSED), slice S2, wave 1.
**Authority posture:** read-only analysis surface. The inventory makes the canonical instruction sources reconstructable (path + role + authority class + sha256 + revision binding); it grants no permission, loads nothing into any runtime, and activates nothing.

## Scope (bounded wave 1)

S2 wave 1 deliberately covers the inventory core only:

1. `runtime/instructions/instruction-inventory.mjs` — declared fixed source set (root governance, workflow contract, authority hierarchy/matrix, core prompt architecture, three canonical contracts) plus enumerated skill instruction files (`core/skills/*/SKILL.md`, `.agents/skills/*/SKILL.md`); sha256 content digests; deterministic digest binding revision + source digests; fail closed (`INSTRUCTION_SOURCE_MISSING`, `INSTRUCTION_SOURCE_NOT_A_FILE`, `INSTRUCTION_SOURCE_DIR_MISSING`, `INVENTORY_REVISION_REQUIRED`).
2. `scripts/tools/build-instruction-inventory.mjs` — stdout-only CLI with mandatory `--revision` binding; never writes, never spawns.
3. `tests/vnext/instruction-inventory.test.mjs` — coverage, digest determinism + revision/content sensitivity, fail-closed negatives, and a byte-identical read-only proof across two inventory runs on a temp tree.
4. CHANGELOG entry; this run record.

Out of scope (later waves/slices): the reference/import graph (S2 wave 2), per-task effective-instruction selection, the instruction bundle contract (S6), any auditor logic (S3). The module binds no git state itself — the caller supplies the revision, keeping the module pure and the read-only boundary absolute.

## Design Notes

- The declared source set mirrors the S0 map §2 baseline components that carry instruction semantics; generated/derived surfaces (provider exports, compatibility mirrors) are intentionally excluded — they are projections, not instruction sources.
- Skill instruction enumeration is structural (SKILL.md / top-level `*.skill.yaml` per skill directory); no YAML frontmatter parsing, so no YAML-syntax trap surface.
- The inventory digest excludes byte counts (content already bound via per-file sha256), making the digest stable across byte-count bookkeeping while remaining content- and revision-sensitive.

## Verification Performed

- `node --check` on both new `.mjs` files.
- `node --test tests/vnext/instruction-inventory.test.mjs` — all pass.
- `npm run test:vnext` full suite — see disposition `validation` entries.
- CLI smoke: `node scripts/tools/build-instruction-inventory.mjs --revision 739b9c80a394c40639cb3d9043db757aca6df5d4` on the change worktree prints a valid inventory; without `--revision` it exits 2 with usage guidance.
- `npm run validate`, `npm run validate-neutral`, `npm run validate-maws-vnext`, `npm run validate-secrets`, `npm run scan-secrets` — PASS.
- Disposition validated: `node scripts/tools/validate-registry-disposition.mjs evidence/instruction-inventory-2026-10-20/registry-disposition.json`.

## Results

- Two-commit structure: implementation commit, then disposition commit binding `implementation_commit_sha`.
- Disposition: `NO_CHANGE` / `material_change: true` / `registry_relevant_change: false`, with the explicit determination that no registered record changed: this slice adds a proposal-scoped read-only analysis module and tests; it creates no contract, no canonical claim, no authority mapping, and no lifecycle binding (no authority-matrix or canonical-files edits were made — the intake-binding precedent shows canonical-claim surfaces are only touched when a contract lands).

## Open Items

- S2 wave 2 (reference/import graph) and S3 (Instruction Auditor) per spec §15.
- Unitera-registry CONTRACT_RECORD write for the S1 `skill-feedback.schema.json` (open from PR #22) and the subsequent disposition rebinds to `UPDATED`.
