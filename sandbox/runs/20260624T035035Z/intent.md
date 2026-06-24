# Intent

## Run Type

Preparation — no Pi execution in this slice

## Goal

Prepare evidence folder and define command shape for a subsequent Pi Tier-1 Dry Run
Execution Slice. This slice creates the evidence scaffold only; no Pi session is started.

## Skill Contract

`skills/pi/tier1-docs-draft.skill.yaml` — `pi.tier1.docs_draft`

## Tool Contract

`tools/pi-cli.tool.yaml` — `pi.cli` — allowed command shape: `tier1_markdown_draft_no_tools`

## Write Mode

`draft_only` (policies/write-modes.policy.yaml)

## Session Type

Tier 1 / `draft_only_generation`

## Tier Boundary

`--no-tools --print` — mandatory; no file writes via Pi; no open-ended session

## Planned Prompt (Execution Slice only)

A bounded Tier-1 draft-only prompt will be defined in the Execution Slice.
The prompt must be bounded (no open-ended query), produce only Markdown output,
and not request tools, secrets, Vault access, or network calls.

Example bounded scope (to be confirmed in Execution Slice):
Generate a brief Markdown summary of the Baum-OS Pi governance cycle completed in v0.2,
suitable for `docs/proposals/` — draft only, no canonical write.

## Evidence Path

`sandbox/runs/20260624T035035Z/`

## Boundary

- No Pi execution in this Preparation Slice
- No provider call
- No Vault write
- No secret read
- No network
- No CI/hook
- No runtime code change
- No automatic promotion
- `providers/pi/` permanently forbidden

## Owner Approval

OWNER_APPROVAL: Pi Tier-1 Dry Run Preparation Slice — 2026-06-24
