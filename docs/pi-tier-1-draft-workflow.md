# Baum-OS Pi Tier-1 — Draft-Only Workflow

> CANONICAL · TIER-1 DRAFT WORKFLOW · NO RUNTIME IMPLEMENTATION

## Purpose & Scope

- Canonical Tier-1 draft workflow for Baum-OS / Pi draft-only sessions.
- Scope: intake, routing, handoff for low-risk, reversible agent tasks.
- Not a runtime implementation, validator, or provider adapter.
- Does not modify portfolio, shared-core, or repo-local runtime files.
- Does not grant execution rights, merge authority, or runtime control.
- Does not supersede `AGENTS.md`, `README.md`, or pillar frontdoors.
- Status: active canonical workflow — promoted via owner-approved slice.

## Hard Constraints

- **no runtime execution.** Draft-only mode; no invocation against live systems or agents.
- **no secrets.** No API keys, tokens, credentials, private keys, mnemonics, cookies, or secret material in text or attachments.
- **no Vault write.** No write, mutation, or creation in Vault. Read access requires approved read-only bridge.
- Draft output lives in repo-local Markdown only; no side effects on shared surfaces.
- Violations are invalid and rejected before review.
- Fail-closed: missing or ambiguous constraint language blocks promotion.

## Operator Flow

1. Pre-check repo state: `git status`, verify `providers/pi/` absent, verify required directories exist (`sandbox/runs/`, `drafts/` or `docs/proposals/`).
2. Confirm owner approval string is present before any Pi invocation.
3. Confirm the accepted skill contract (`docs/pi-tier-1-draft-session-design.md`) covers this run.
4. Confirm allowed output path (`./drafts/` or `./docs/proposals/`).
5. Create timestamped evidence directory: `sandbox/runs/<timestamp>/` and write `intent.md`.
6. Run Pi only with the approved bounded command shape (see Command Shape below).
7. Save Pi output only to the approved draft/proposal path. If Pi attempts tools, Vault, secrets, or non-approved paths: abort immediately.
8. Capture all required evidence artifacts under `sandbox/runs/<timestamp>/`.
9. Validate boundaries and diff: confirm output is Markdown-only, no canonical files mutated, no secrets in output.
10. Stage and commit only the approved files (output + evidence). No `git add .` or `git add -A`.
11. Review the draft through the proposal review gate before any promotion.
12. Promote only through a separate owner-approved promotion slice. No automatic promotion.

## Command Shape

```bash
pi \
  --provider minimax \
  --model MiniMax-M3 \
  --no-session \
  --no-tools \
  --print \
  "<bounded draft-only prompt>"
```

For Markdown-only Tier-1 runs, `--no-tools` follows the accepted rule in `docs/pi-tier-1-draft-session-design.md`.

## Decision Points

| Point | Proceed | Block |
|-------|---------|-------|
| Owner approval | explicit approval string present | missing approval |
| Output path | `./drafts/` or `./docs/proposals/` | canonical path requested |
| Vault | read-only / draft_outside_vault | Vault write requested |
| Network | NET_0 | network requested |
| Tool mode | `--no-tools` or explicitly approved tools | implicit tool use |
| Secrets | none | env / auth / private path requested |
| Evidence | required artifacts created | evidence incomplete |
| Promotion | separate slice | automatic promotion requested |

## Evidence & Storage

- All evidence lives under `sandbox/runs/<timestamp>`.
- Tier-1 drafts are not promotable without evidence.
- `sandbox/runs/<timestamp>` is the single source of truth; no writes outside it during the run.

**Canonical evidence structure for this repo:** `sandbox/runs/<timestamp>/` with the artifacts defined in `sandbox/runs/run-evidence-template.md`.

Any alternative structures require a separate owner-approved schema change before use.

## Promotion Gate

- Promotion requires an owner-approved slice per event; never bundles multiple.
- A draft entry alone is not promotable; a review step must occur first.
- Each slice names an authority surface as owner (not inferred or default), with scope and write target.
- Promotion evidence includes slice description, write path, and verification reference.
- Status progression is fixed: proposed → drafted → applied → verified.
- Validation outcome stays separate: PASS or BLOCKED.
- Failed validation blocks promotion; draft remains at its prior status.
- All promotion artifacts use exact paths and labeled evidence language.

## Reference-Only Boundaries

```text
Skill contract authority:     docs/pi-tier-1-draft-session-design.md
Evidence authority:           sandbox/runs/run-evidence-template.md
Pi session policy authority:  runtime/surfaces/pi/session-policy.md
Evidence contract authority:  runtime/surfaces/pi/evidence-contract.md
Vault boundary authority:     docs/vault-memory-bridge-boundary-decision.md
```

## Non-Goals

```text
No runtime implementation.
No validator.
No skill registry.
No provider adapter.
No providers/pi/.
No Vault write.
No MCP/Vault integration.
No second skill.
No automatic execution.
No automatic promotion.
No secrets.
```
