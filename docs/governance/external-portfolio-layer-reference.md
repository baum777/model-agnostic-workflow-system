# External Portfolio Governance Layer Reference

Class: canonical.
Use rule: this file is a structured pointer to workspace-local portfolio governance; it does not duplicate local portfolio rule content.

## Purpose

This repository is a shared-core, model-agnostic workflow system. It is not the canonical home for workspace-local portfolio governance, journal history, commit reverse-analysis logs, or local operating contracts.

## External Canonical Portfolio Layer

For the `C:\workspace\main_projects` workspace, the canonical local portfolio governance layer is:

`C:\workspace\main_projects\portfolio`

## Authority Boundary

- Shared core remains canonical for portable reusable capabilities:
  - reusable model-agnostic skills
  - contracts and manifests
  - provider-neutral workflow logic
  - shared validation and rollout playbooks
- The external portfolio layer remains canonical for workspace-local governance:
  - local operating contract
  - truth-plane and folder-role mapping
  - bounded working context
  - daily journal/history obligations
  - commit-linked semantic reverse-analysis rules
  - local prompt/orchestration overlay requirements

## Required Portfolio Files Before Portfolio-Level or Cross-Repo Work

- `C:\workspace\main_projects\portfolio\operating-contract.md`
- `C:\workspace\main_projects\portfolio\index.md`
- `C:\workspace\main_projects\portfolio\working-rules.md`
- `C:\workspace\main_projects\portfolio\context.md`
- `C:\workspace\main_projects\portfolio\repo-audit.md`
- `C:\workspace\main_projects\portfolio\implementation-plan.md`
- `C:\workspace\main_projects\portfolio\system-prompt-overlay.md`

If prior changes are relevant, also inspect:

- `C:\workspace\main_projects\portfolio\commit-log\`
- `C:\workspace\main_projects\portfolio\daily\`

## Conflict Handling

If shared-core guidance and workspace-local portfolio guidance appear to conflict, fail closed and report the conflict explicitly before implementation.

## Integration Rule

Keep this file as a reference pointer only. Do not migrate or duplicate workspace-local portfolio governance rules into shared-core unless there is an explicit architecture decision to make them portable and reusable.
