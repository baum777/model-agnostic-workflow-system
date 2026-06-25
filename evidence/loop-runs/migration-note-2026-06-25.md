# Migration Note — Repo Loop Core Repair

Date: 2026-06-25

## Reason

The `command/ loop repo <path>` loop was initially implemented in:

`/home/baum/workspace/baum-os`

The actual Baum-OS core is:

`/home/baum/workspace/baum-os/agentic_workflow/model-agnostic-workflow-system`

## Decision

The source repo is treated as read-only migration source.
Old evidence runs from the source repo are not copied as canonical target evidence
because they refer to the wrong core path (`baum-os` root, not this repo).

## Migrated Surfaces

- `commands/loop-repo.md`
- `loops/repo-loop/README.md`
- `loops/repo-loop/command-contract.md`
- `loops/repo-loop/stop-rules.md`
- `loops/repo-loop/prompt-template.md`
- `loops/repo-loop/output-schema.json`
- `loops/repo-loop/validator-spec.md`
- `scripts/tools/baum-loop-repo.mjs`
- `scripts/tools/validate-loop-run.mjs`
- `scripts/tools/ci-gate.mjs`
- `evidence/loop-runs/README.md`

## Path Adaptation

Source used `scripts/` for adapter and validator.
Target convention is `scripts/tools/` — all script references updated accordingly.

## Required Target Evidence

A new adapter run must be executed against this repo and validated with the runtime validator.
Old `baum-os-pass-*` runs are migration artifacts only and do not constitute target evidence.
