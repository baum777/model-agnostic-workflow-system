# SII Slice S2 Wave 2 — Instruction Reference Graph (2026-10-20)

Implements slice S2 tasks "Datei-/Import-/Referenzgraph erstellen" and
"Read-only-Grenzen testen" of MAWS-SII-TARGET-SPEC-001 (PROPOSED) on top of
the wave 1 instruction inventory.

## Scope

- `runtime/instructions/instruction-resolver.mjs` — `buildInstructionGraph({root, revision})`
  over the wave 1 inventory source set. Closed extraction rule set:
  - `md_link` — markdown links `[...](target)`, resolved document-relative;
    web schemes (`http:`, `https:`, `mailto:`, `data:`) and pure anchors are
    not instruction references and produce no edge;
  - `inline_path` — path-shaped code spans (no whitespace, contains `/`,
    ends in a file extension), resolved repository-root-relative;
  - `npm_run_command` — `npm run <script>` code spans, resolved against the
    root package.json scripts map.
- Dangling references are recorded as data (`status: 'dangling'`,
  `resolved: null`, 1-based line number) — they are observations for the S3
  auditor, not errors raised here.
- Graph digest binds revision + all nodes + all edges (canonical JSON,
  sha256); same tree + revision always yields the same digest.
- Fail-closed: missing revision (`INVENTORY_REVISION_REQUIRED`, inherited
  from the inventory), command references without a readable package.json
  (`INSTRUCTION_PACKAGE_MANIFEST_MISSING`).
- `scripts/tools/build-instruction-graph.mjs` — stdout-only CLI;
  `--revision` mandatory (exit 2 without), optional `--root`, `--dangling`
  filter. Never writes, never spawns.
- `tests/vnext/instruction-resolver.test.mjs` — 6 tests: real-repo graph
  invariants + digest determinism/revision sensitivity; closed-rule
  extraction (resolved, dangling, external, command edges, line numbers);
  fail-closed without package manifest; inherited revision contract;
  byte-identical read-only proof; edge-relevant content sensitivity.

## Results on this worktree (main pin 87a86d54971ee43ff967c2c336a81d2bf1f38812)

- `node --test tests/vnext/instruction-resolver.test.mjs` — 6/6 pass.
- `npm run test:vnext` — 307/307 pass, 0 fail.
- `npm run validate` / `validate-neutral` / `validate-maws-vnext` /
  `validate-secrets` / `scan-secrets` — PASS (exit 0 each).
- `npm run eval:maws-vnext` — exit 0.
- CLI smoke on the real tree, `--revision 87a86d54`: graph digest
  `d52956ce95b9d7c8ffc4977f87fd9cfb347a5846b03deca5f9278316452bf1e2`,
  10 dangling references observed across instruction sources (examples:
  `core/skills/supabase-deployment/SKILL.md` → `supabase/config.toml`
  lines 41/52; `docs/authority-matrix.md` →
  `core/skills/neon-db-setup/SKILL.md` line 161, `.codex/repo-intake-inputs.json`
  line 195). Recorded as analysis input for S3; nothing repaired here —
  silent cross-surface repair is prohibited by the working rules.

## Posture

Analysis surface only, per spec §6.5 and §21: the graph grants no
permission, loads nothing into any runtime, activates nothing, and creates
no contract, claim, or authority mapping. Registry relevance determination:
NO_CHANGE (see registry-disposition.json). S2 DoD "effektiv geladene
Instruktionen sind rekonstruierbar" is now met by wave 1 + wave 2 together;
the audit taxonomy (S3) remains open and is the next slice.
