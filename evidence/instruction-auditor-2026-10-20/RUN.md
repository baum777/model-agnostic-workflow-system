# SII Slice S3 — Instruction Auditor (2026-10-20)

Implements slice S3 of MAWS-SII-TARGET-SPEC-001 (PROPOSED): audit taxonomy,
static reference checking, advisory classification of semantic findings, and
evidence-backed audit reports — on top of the S2 wave 2 reference graph.

## Scope

- `core/contracts/instruction-audit-finding.schema.json` — NEW canonical
  contract: spec §6.4 finding contract with the closed §6.2 taxonomy
  (10 classes), deterministic provenance (source path, revision, 1-based
  line range, authority class), closed risk/confidence vocabularies, and
  fail-closed if/then policy:
  `semantic_advisory` can never carry `blocker` risk; `blocker` risk and the
  `AUTHORITY_LEAK` class always force `requires_owner_review: true`.
- `runtime/instructions/instruction-auditor.mjs` — read-only auditor over
  `buildInstructionGraph`. Wave 1 analyzes the two statically decidable
  classes: `STALE_REFERENCE` (dangling file edges, risk high) and
  `INVALID_COMMAND` (dangling command edges, risk medium). The remaining
  eight classes are declared in `coverage.classes_declared_not_analyzable`
  with explicit limitation reasons — absence of findings for them is a
  declared limitation, never a silent clean bill. `inferred_cause` is `null`
  in wave 1: the auditor does not guess causes.
- `scripts/tools/validate-instruction-integrity.mjs` (spec §14 path, npm
  script `validate-instruction-integrity`) — fixture mode (18 cases: 5
  positive / 13 negative, all matching their labels) and `--revision` mode:
  live audit with per-finding contract round-trip validation, `--output`
  persistence, opt-in `--fail-on-blocker`. Default posture is advisory:
  findings never gate by themselves (spec §6.5 — blocking via findings is a
  gate-policy decision owned elsewhere).
- `evals/fixtures/maws-vnext/instruction-audit-findings.contracts.json`
  registered in `evals/catalog.json` (covered by `eval:maws-vnext`);
  `core/contracts/README.md` canonical files list extended;
  `tests/vnext/instruction-auditor.test.mjs` — 5 tests incl. contract
  round-trip on emitted findings and the byte-identical read-only proof.

## Results on this worktree (main pin 2eff613f924c7a8e20cdc3a946971bed919d23d6, implementation commit 866ab49ef6056aa2cc929744c5ed6b4c5a83d63e)

- `node --test tests/vnext/instruction-auditor.test.mjs` — 5/5 pass.
- `npm run test:vnext` — 312/312 pass, 0 fail.
- `npm run validate` / `validate-neutral` / `validate-maws-vnext` /
  `validate-secrets` / `scan-secrets` — PASS (exit 0 each);
  `npm run eval:maws-vnext` — exit 0 (fixture now included).
- Fixture validator: 18 cases checked, 0 unexpected results.
- Live audit at implementation commit `866ab49`:
  `ia_2366a005f76a00ed` — 10 findings (10 STALE_REFERENCE, 0 blocker),
  0 contract violations, 2 classes analyzed, 8 declared not statically
  analyzable. Full machine-readable report persisted at
  `evidence/audit-report-866ab49.json`. All 10 findings correspond 1:1 to
  the dangling references the S2 wave 2 CLI observed at `87a86d54`; nothing
  was repaired in this slice (silent cross-surface repair is prohibited).

## S3 DoD

Defined instruction problems are detected reproducibly and classified
correctly: re-running the audit on an unchanged tree reproduces audit id,
finding ids, and digest; the closed taxonomy plus the honest coverage
declaration prevent taxonomy drift; semantic findings are advisory by
construction (schema-enforced).

## Posture

A finding is analysis output, never authority (spec §6.5, §21): it mutates
nothing, gates nothing by default, grants no permission, and replaces no
approval decision. The new canonical contract carries the pending registry
obligation — see registry-disposition.json (REQUIRED_BUT_BLOCKED, following
the two-phase intake-binding precedent: source publication first, registry
CONTRACT_RECORD write second, disposition rebind to UPDATED third).
