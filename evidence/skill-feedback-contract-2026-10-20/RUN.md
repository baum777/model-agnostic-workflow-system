# RUN — Skill Feedback Contract 2026-10-20 (SII implementation slice S1)

**Run ID:** skill-feedback-contract-2026-10-20
**Date:** 2026-10-20
**Baseline:** `origin/main` = `982bc548e8b43c3ce1b09474d118740e1c6df372` (Merge PR #21, SII materialization wave 0)
**Spec basis:** `docs/proposals/skill-intelligence-target-spec.md` (`MAWS-SII-TARGET-SPEC-001` v0.1.0, PROPOSED), slice S1, with the S0 current-state map as reconciliation evidence.
**Authority posture:** contract record only. The feedback contract is analysis input for a future improvement lifecycle; it grants no permission, promotes no skill, activates no runtime path, and changes no qualification state. The improvement lifecycle itself (spec sections 8–9) is NOT implemented by this slice.

## Scope

1. New canonical contract `core/contracts/skill-feedback.schema.json` (draft 2020-12 subset of the repo's validator engine; reuses `maws-vnext-common.schema.json` vocabulary: `riskClass`, `executorId`, `capabilityId`).
2. Fixture `evals/fixtures/maws-vnext/skill-feedback.contracts.json` — 5 positive / 11 negative cases, registered in `evals/catalog.json` (covered by `eval:maws-vnext` in CI).
3. Validator CLI `scripts/tools/validate-skill-feedback.mjs` + npm script `validate-skill-feedback` (validates the canonical fixture or explicit record files; exit nonzero on any unexpected result).
4. Tests `tests/vnext/skill-feedback.test.mjs` (picked up by `test:vnext`).
5. `core/contracts/README.md` canonical files list + description; CHANGELOG entry; this run record.

## Deterministic Design Decisions

- **Model self-report excluded by construction (spec 8.2).** `source.category` is a closed enum without any self-report value; prose may quote model statements, but a record cannot be sourced from model self-report. Negative fixture case `skill-feedback-invalid-model-self-report-source` proves the rejection.
- **Owner review forced (fail-closed if/then).** `error_class: UNKNOWN_ROOT_CAUSE` and `proposed_disposition: CREATE_SKILL` each force `requires_owner_review: true`. Negative cases prove both bypasses fail.
- **Promotion is never a feedback decision (spec 13.4).** `PROMOTE`/`APPLY` are not disposition values; the closed Stage-3 vocabulary from spec section 9 applies.
- **Closed record shape.** `additionalProperties: false` on the record and on `source`/`subject`/`provenance`; `evidence_refs` requires at least one entry (a record without evidence cannot be reconstructed later).
- **Subject bindings modeled per the S1 checklist** (`task_ref` required; `run_ref`, `skill_ref`, `executor_id`, `capability_id`, `instruction_bundle_ref` declared and optional) — the instruction-bundle ref is forward-looking for S6/S7 and binds nothing today.

## Verification Performed

- `node --test tests/vnext/skill-feedback.test.mjs` — all pass (see disposition `validation` entries for suite totals).
- `npm run validate-skill-feedback` — fixture: 16 cases checked, 0 unexpected results.
- `npm run eval:maws-vnext` — includes the new registered fixture.
- `npm run validate`, `npm run validate-neutral`, `npm run validate-maws-vnext` — PASS.
- `node --check` on the new `.mjs` files (CI runs the same over all runtime/scripts/tools sources).
- Disposition validated: `node scripts/tools/validate-registry-disposition.mjs evidence/skill-feedback-contract-2026-10-20/registry-disposition.json`.

## Results

- Two-commit structure: implementation commit, then disposition commit binding `implementation_commit_sha`.
- Disposition: `REQUIRED_BUT_BLOCKED` / `registry_relevant_change: true` / `CONTRACT_RECORD:core/contracts/skill-feedback.schema.json` / `registry_commit_sha: null` — the Unitera-registry write for the new canonical contract is its own registered change (precedent: `evidence/execution-intake-binding-2026-10-20/`, which followed the same two-phase REQUIRED_BUT_BLOCKED → UPDATED rebind pattern).

## Open Items

- Unitera-registry CONTRACT_RECORD write for `skill-feedback.schema.json`, then rebind of this disposition to `UPDATED` with the registry `registry_commit_sha` (follow-up, own gated change).
- S2 (Instruction Inventory) is the next implementation slice per the S0 map §9.

## Repair round (2026-10-20, post-merge codex findings)

The codex review completed at `613a5e7` after the PR #22 merge with two
P2 findings (`has_unresolved_findings: true` at merge time). Both are
repaired before the pending registry CONTRACT_RECORD write:

- **F-22-1 (P2)** — `error_class: TOOL_CONTRACT_ERROR` still accepted the
  skill-changing dispositions `EXTEND_SKILL`/`CREATE_SKILL`, contradicting
  spec 8.4 (the skill is not the improvement area when the demonstrated
  cause is exclusively in the tool contract). Repair: fail-closed if/then
  narrowing to the seven non-skill-changing dispositions; owner review
  does not legitimize the mismatch (negative fixture proves it).
- **F-22-2 (P2)** — `evidence_refs` items were unrestricted strings, so
  `model self-report: trust me` validated despite the contract's promise.
  Repair: closed source-kind scheme (`artifact:`, `edge:`, `eval:`,
  `file:`, `graph:`, `operator:`, `path:`, `review:`, `run:`, `sandbox:`,
  `session:`, `ticket:`, `url:`); there is no self-report scheme and
  unmarked refs are rejected (two negative fixtures).

Verification after repair: fixture validator 21 cases / 0 unexpected;
`test:vnext` 314/314; `eval:maws-vnext` exit 0; validate / validate-neutral
/ validate-maws-vnext / validate-secrets / scan-secrets PASS. The S1
disposition is rebound to repair commit `c5f6fbedd45c53f95b3cc69b2ed5f598557fe220`
while staying REQUIRED_BUT_BLOCKED until the registry write.

## Registry write (two-phase closure, 2026-10-20)

The pending CONTRACT_RECORD obligation was discharged by the registry pull
request `projection/sii-contracts-20261020` (pull request 216), which
published `registry/MAWS_SKILL_FEEDBACK_2026_10_20_001.yaml` (run change
registration) and `registry/MAWS_SKILL_FEEDBACK_CONTRACT_2026_10_20_001.yaml`
(CONTRACT_RECORD projection) and merged as
`e22eb3351b6a1d810272ac9c605f9d212bfd0d88`. Both registry CI gates passed at
that merge commit (registry validation offline, cross-repository
reachability). This disposition is rebound from REQUIRED_BUT_BLOCKED to
UPDATED with `registry_commit_sha` equal to that merge commit. The registered
contract state is the repaired one (pull request 27), and both publications
are named in the registry record so the history stays reconstructable.
