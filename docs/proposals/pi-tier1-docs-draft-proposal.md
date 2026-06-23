# Baum-OS Pi Tier-1 — Draft-Only Workflow Proposal

> Status: NON-CANONICAL · DRAFT-ONLY · NO RUNTIME EXECUTION

## Purpose & Scope

- Non-canonical and draft-only proposal for a Baum-OS Pi Tier-1 workflow.
- Scope: intake, routing, handoff for low-risk, reversible agent tasks.
- Not a binding spec, approved policy, or governance change.
- Does not modify portfolio, shared-core, or repo-local canonical files.
- Does not grant execution rights, merge authority, or runtime control.
- Does not supersede `AGENTS.md`, `README.md`, or pillar frontdoors.
- Status: proposed. Promotion needs owner sign-off, validation evidence, and a recorded next gate.

## Hard Constraints

- **no runtime execution.** Draft-only; no run, invocation, or simulation against live systems or agents.
- **no secrets.** No API keys, tokens, credentials, private keys, mnemonics, cookies, or secret material in text or attachments.
- **no Vault write.** No write, mutation, or creation in HashiCorp Vault or equivalent secrets backend. Read access is out of scope.
- Draft lives in repo-local Markdown only; no side effects on shared surfaces.
- Violations are invalid and rejected before review.
- Fail-closed: missing or ambiguous constraint language blocks promotion.

## Evidence & Storage

- All evidence lives under `sandbox/runs/<timestamp>`.
- Per run: `input/`, `output/`, `logs/`, `verify/`, `meta.json`.
- `meta.json` fields: `run_id`, `start_ts`, `end_ts`, `task`, `tier`, `model`, `git_sha`, `status`.
- Raw inputs copied read-only to `input/`; derived artifacts written to `output/`.
- Tool calls and agent steps appended to `logs/events.jsonl` with `ts`, `kind`, `actor`, `payload`.
- Verification evidence (commands, diffs, screenshots) stored under `verify/`, indexed in `meta.json`.
- Tier-1 drafts purged after review unless promoted; promotion copies them to the proposal surface.
- `sandbox/runs/<timestamp>` is the single source of truth; no writes outside it during the run.

## Promotion Gate

- Promotion requires an owner-approved slice per event; never bundles multiple.
- A draft entry alone is not promotable; a real write step must occur first.
- Each slice names an authority surface as owner (not inferred or default), with scope and write target.
- Promotion evidence includes slice description, write path, and verification reference.
- Status progression is fixed: proposed → drafted → applied → verified.
- Validation outcome stays separate: PASS or BLOCKED.
- Failed validation blocks promotion; draft remains at its prior status.
- All promotion artifacts use exact paths and labeled evidence language.
