# MAWS vNext — Skill Intelligence & Instruction Integrity: Current-State Map (S0)

**Document ID:** MAWS-SII-S0-MAP-001
**Date:** 2026-10-20
**Status:** proposal review material / non-canonical (see `docs/proposals/README.md`)
**Companion to:** `docs/proposals/skill-intelligence-target-spec.md` (`MAWS-SII-TARGET-SPEC-001` v0.1.0)
**Method:** read-only verification of the target specification's baseline claims against the repository tree. No file in the repository was modified by the reconciliation itself.

## 1. Verified Baseline Pin

All checks were executed against the canonical remote state, not the stale local primary checkout:

```text
origin/main = dcd95bf2d1d5a811bfd81026e943e3c2d0e7a072
            (Merge PR #20, 2026-10-20T06:42:17+02:00)
includes    = f66212514483fc39770e8db4615731d736b379ef (PR #18, security repair F-01..F-07)
            = 8e275502df5217269a9052669da500b276ce1163 + 578439a (PR #20, audit evidence + disposition)
```

Local-checkout finding: the primary worktree at `agentic_workflow/model-agnostic-workflow-system` sits at `d6a8fdd` (2026-09-28, 22 days behind `origin/main`) and carries 44 uncommitted entries (CHANGELOG, core-registry mirrors, portable-skill-manifest, several `providers/*/export.json`). These local modifications are unexplained and were not touched. Every implementation slice of the target spec MUST work from a fresh worktree pinned to `origin/main`, and the dirty primary checkout needs its own separate disposition.

## 2. Target Spec §3.1 Baseline Table — 18/18 confirmed

Every component listed in Section 3.1 of the target spec exists at the pinned baseline:

| Component | Status |
|---|---|
| `AGENTS.md`, `WORKFLOW.md` | present |
| `docs/governance/source-hierarchy.md` | present |
| `docs/authority-matrix.md` | present |
| `docs/model-agnostic-core-prompt-system.md` | present |
| `core/skills/` | present (19 entries) |
| `.agents/skills/` | present (3 entries) |
| `core/contracts/portable-skill-manifest.json` | present |
| `core/contracts/workflow-routing-map.json` | present |
| `core/contracts/permission-boundary.json` | present |
| `core/contracts/workflow-memory-contract.json` | present |
| `runtime/qualification/` | present (applicability, eligibility, fingerprint, materiality, profile-subsumption) |
| `runtime/orchestrator/` | present (`run-engine.mjs`) |
| `artifacts/runtime-runs/` | present |
| `runtime/skills/frontdoor.mjs` | present |
| `evals/` | present (catalog with 40 fixtures) |
| `docs/harness/self-harness-loop.md` | present |
| `providers/` | present |

## 3. Target Spec §3.3 Extension Gaps — 6/6 confirmed real

1. **No feedback-to-skill-improvement lifecycle.** The only `feedback` occurrences in `runtime/`, `core/` and `evals/` are portable agent-facing skills (e.g. `core/skills/diagnostic-feedback-loop/SKILL.md`, a diagnosis skill) and contract metadata. No runtime feedback pipeline exists.
2. **No instruction-integrity audit.** The only `integrity` occurrence in runtime code is a comment about run-directory evidence integrity (`runtime/cli/runtime-run.mjs:279`). No instruction auditor exists; there is no `runtime/instructions/` module.
3. **No behavioral baseline/candidate evaluation.** `evals/` is a deterministic contract/fixture certification suite. `evals/fixtures/maws-vnext-baseline.json` is a maturity-drift baseline (anchors design baseline `a84aa7d4`, PR #6) — not a behavioral baseline-vs-candidate comparison.
4. **No instruction-bundle binding in the qualification fingerprint.** `runtime/qualification/fingerprint.mjs` fixes `FINGERPRINT_COMPONENT_KEYS` to exactly `model_id, provider_id, runtime_harness, tool_contract_refs, api_surface_version, qualification_profile_ref` and fails closed on any unexpected component key. `runtime/qualification/materiality.mjs` tracks the same six components plus `execution_profile_ref` (`TRACKED_COMPONENTS`); MATERIAL/UNKNOWN are unroutable without requalification.
5. **No adaptive context assembly.** Zero matches for context-assembly/adaptive composition logic in `runtime/` and `core/`.
6. **No joint improvement analysis.** Only documentation exists: `docs/harness/self-harness-loop.md` is explicitly "docs-only / concept-document — Slice 1 (Weakness Mining only)" with Stages 2 (Harness Proposal) and 3 (Proposal Validation) "deliberately deferred". The target spec's §12.1 characterization is exact, and its §12 does not auto-activate the deferred stages.

## 4. Target Spec §14 Proposed Paths — 16/16 collision-free

All proposed new surfaces are free at the pinned baseline; the `*.schema.json` naming matches the existing contract convention (draft 2020-12, `$id: core/contracts/<name>.schema.json`, `$ref` into `maws-vnext-common.schema.json#/$defs/...`):

- `core/contracts/skill-feedback.schema.json`, `skill-improvement-proposal.schema.json`, `instruction-audit-finding.schema.json`, `instruction-bundle.schema.json`, `skill-effectiveness-report.schema.json` — free
- `runtime/instructions/` (inventory, auditor, resolver, context-assembler) — free
- `runtime/skills/feedback-analyzer.mjs`, `improvement-classifier.mjs` — free
- `evals/skill-effectiveness/`, `evals/instruction-integrity/` — free
- `scripts/tools/validate-instruction-integrity.mjs`, `run-skill-effectiveness-evals.mjs` — free
- `docs/skill-intelligence-target-spec.md`, `instruction-integrity-contract.md`, `skill-improvement-lifecycle.md` — free (this materialization stages the spec under `docs/proposals/` first)
- `drafts/skills/` — free

## 5. Target Spec §17 Commands — 6/6 present, 3 target commands correctly declared absent

Present at the pinned baseline: `npm run validate`, `validate-neutral`, `eval`, `eval:skill-routing`, `eval:maws-vnext`, `test:vnext`.
Correctly declared by the spec as "derzeit nicht als verfügbar nachgewiesen" and confirmed missing: `validate:instructions`, `eval:skill-effectiveness`, `eval:instruction-integrity`.

## 6. §13.1 Frontdoor Claim — confirmed wired and fail-closed

`runtime/skills/frontdoor.mjs` binds `evidence.skillspector` and `evidence.skillevaluator_tier1` and fails closed (`SKILLSPECTOR_EVIDENCE_MISSING`, `SKILLSPECTOR_VERSION_UNKNOWN`, `SKILLSPECTOR_INCOMPLETE`, `SKILLSPECTOR_BLOCKED`, `SKILLSPECTOR_CRITICAL_FINDINGS`, severity-scaled blockers). The most recent recorded frontdoor admission run admitted 0/45 candidates (commit `d6a8fdd`). New skills produced by the future improvement loop will pass through this gate unchanged, exactly as §13.1 requires.

## 7. Implementation Constraints Discovered (input to slice planning)

1. **S7 is a contract amendment, not a field addition.** The fingerprint component key set is exactly closed (unexpected keys throw `FINGERPRINT_COMPONENTS_INVALID`). Adding an effective-instruction-bundle digest requires coordinated changes to `core/contracts/qualification-fingerprint.schema.json`, `runtime/qualification/fingerprint.mjs`, `runtime/qualification/materiality.mjs` (`TRACKED_COMPONENTS`), and `runtime/cli/runtime-run.mjs` validation — with the intended fail-closed consequence that all existing qualification fingerprints classify as UNKNOWN and become unroutable until requalification.
2. **Maturity drift gate.** `npm run validate-maws-vnext` fails closed when `docs/authority-matrix.md` claims more maturity than repository evidence supports. New SII surfaces must enter as `contract-only`/`contract-backed` (or unlisted, following the execution-intake-binding precedent) and may only be promoted in step with evidence.
3. **Eval fixtures are catalog-declared.** `run-certification-evals.mjs` loads fixtures listed in `evals/catalog.json` (`fixtures` array); new eval fixtures must be registered there to be covered by `npm run eval:maws-vnext` in CI.
4. **Registry disposition two-phase precedent.** A new canonical contract ships with `status: REQUIRED_BUT_BLOCKED` (`registry_commit_sha: null`, `CONTRACT_RECORD` affected record) and is rebound to `UPDATED` after the separate Unitera-registry write (precedent: `evidence/execution-intake-binding-2026-10-20/`).
5. **Spec §19 boundaries align with current posture.** No HTTP/MCP/daemon activation, no second registry, no autonomous promotion exists today; nothing in the current tree conflicts with the non-goals.

## 8. Reuse / Extend / Create Disposition (§8.4 gate applied)

```text
REUSE  all 18 §3.1 baseline components (verified present, in their canonical roles)
CREATE 16 proposed new surfaces (§14 collision-free; no overlapping implementation exists)
EXTEND qualification fingerprint + materiality contract spine in S7 (exact-closed-key amendment)
```

## 9. Next Gates

Per the target spec's "Next Gate" chain and slice order:

```text
S0 Current-State Reconciliation  -> this document
S1 Feedback Contract             -> core/contracts/skill-feedback.schema.json + fixtures + validator + tests
S2 Instruction Inventory         -> runtime/instructions/instruction-inventory.mjs (read-only, digested)
then S3.. per docs/proposals/skill-intelligence-target-spec.md §15
```

Each slice must re-verify the repository HEAD it pins (§3.3 of the spec) and ship its own registry disposition per `docs/governance/registry-disposition.md`.
