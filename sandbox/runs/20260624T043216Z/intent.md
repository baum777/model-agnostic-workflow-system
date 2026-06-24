# Intent

## Run Type

Official Pi Tier-1 Dry Run — bounded prompt, real provider output

## Goal

Execute a single bounded Pi Tier-1 draft-only run to produce a non-canonical
Markdown draft summarizing the Baum-OS v0.1 and v0.2-pre-runtime governance cycle.
Output is draft-only for human review; no promotion, no canonical write.

## Skill Contract

`skills/pi/tier1-docs-draft.skill.yaml` — `pi.tier1.docs_draft`

## Tool Contract

`tools/pi-cli.tool.yaml` — `pi.cli` — command shape: `tier1_markdown_draft_no_tools`

## Write Mode

`draft_only_generation` (policies/write-modes.policy.yaml)

## Session Type

Tier 1 / `draft_only_generation`

## Tier Boundary

`--no-session --no-tools --print` — all three flags required; no file writes via Pi;
no open-ended session; output to stdout only (captured to pi-output.md)

## Approved Prompt

Generate a concise Markdown draft titled "Baum-OS Pi Tier-1 Governance Cycle Summary".
Constraints: output only Markdown, 20–30 lines, summarize v0.1 and v0.2-pre-runtime
governance cycle, mention contracts/validator/evidence path/audit-reaudit loop/Pi
runtime surfaces/human approval, no production runtime claims, no commands, no secrets,
no file modifications, draft-only.

## Evidence Path

`sandbox/runs/20260624T043216Z/`

## No Promotion

Output in `pi-output.md` is draft-only. No canonical write. No commit of Pi output
as canonical content. Promotion requires a separate owner-approved promotion slice.

## Owner Approval

OWNER_APPROVAL: Pi Tier-1 Dry Run Execution Slice — Real Bounded Prompt — 2026-06-24
Owner confirmation: MINIMAX_API_KEY loaded outside slice (shell boolean check skipped
per owner directive; connectivity proof 89d193e accepted as key evidence).
