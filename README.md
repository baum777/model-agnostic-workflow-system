# codex-workflow-core

Class: canonical.
Use rule: use this as the shortest practical entrypoint; it should point to the docs hierarchy rather than duplicate it.

Provider-neutral shared-core repository for governed agent workflow artifacts, with Codex kept as a compatibility export.

## Current Truth

Observed repo surfaces:

- `core/` portable core slice
- `core/skills/` portable priority skills
- `skills/` legacy shared exported skills
- `.agents/skills/` repo-local control-plane skills
- `contracts/` neutral registries and compatibility mirrors
- `providers/` canonical adapter exports and compatibility mirrors
- `scripts/tools/` validators and deterministic helper scripts
- `templates/` shared workflow templates
- `examples/` shared workflow examples
- `.codex-plugin/plugin.json` Codex compatibility manifest

## Purpose

- provide reusable workflow skills, contracts, evals, docs, helper scripts, and provider adapter scaffolds
- serve as the versioned source of truth for consumer repositories and compatibility exports

## Versioning

- package version: `0.2.1`
- compatibility: semver, fail closed on breaking metadata changes
- consumer linkage: file-path reference plus explicit version and fingerprint pin

## Start Here

- [core/README.md](C:/workspace/main_projects/codex-workflow-core/core/README.md)
- [docs/architecture.md](C:/workspace/main_projects/codex-workflow-core/docs/architecture.md)
- [docs/authority-matrix.md](C:/workspace/main_projects/codex-workflow-core/docs/authority-matrix.md)
- [docs/usage.md](C:/workspace/main_projects/codex-workflow-core/docs/usage.md)
- [docs/compatibility.md](C:/workspace/main_projects/codex-workflow-core/docs/compatibility.md)
- [docs/portability.md](C:/workspace/main_projects/codex-workflow-core/docs/portability.md)
- [docs/model-agnostic-core-prompt-system.md](C:/workspace/main_projects/codex-workflow-core/docs/model-agnostic-core-prompt-system.md) when the task touches layered prompt architecture, mode routing, or response contracts
- [docs/validation-checklist.md](C:/workspace/main_projects/codex-workflow-core/docs/validation-checklist.md)
- [docs/maintainer-commands.md](C:/workspace/main_projects/codex-workflow-core/docs/maintainer-commands.md)
- [AGENTS.md](C:/workspace/main_projects/codex-workflow-core/AGENTS.md)
- [contracts/README.md](C:/workspace/main_projects/codex-workflow-core/contracts/README.md)
- [providers/README.md](C:/workspace/main_projects/codex-workflow-core/providers/README.md)

## Operational Commands

- `npm run validate` to validate the repo surface
- `npm run validate-neutral` when neutral registry or provider scaffolds change
- `npm run build-registry` when `core/contracts/core-registry.json` needs regeneration
- `npm run build-exports` when provider export bundles need regeneration
- `npm run eval` when certification fixtures or provider exports change
- `npm run fingerprint` when the package state must be pinned
- `npm run validate-consumer` when linkage, overlay, or adoption surfaces change
- `npm run validate-input-contract` when `.codex/repo-intake-inputs.json` changes
- `npm run validate-runtime-policy-input-contract` when `.codex/runtime-policy-inputs.json` changes
- `npm run init-consumer` to scaffold a consumer overlay
- `npm run scan` to inspect repository structure
- `npm run diff` to explain git diffs

## Parameterized Skills

- `repo-intake-sot-mapper` uses a consumer-local input contract declared in `.codex/repo-intake-inputs.json`
- `runtime-policy-auditor` uses a consumer-local input contract declared in `.codex/runtime-policy-inputs.json`
- contract rules live in [docs/shared-with-local-inputs.md](C:/workspace/main_projects/codex-workflow-core/docs/shared-with-local-inputs.md), [docs/repo-intake-skill-contract.md](C:/workspace/main_projects/codex-workflow-core/docs/repo-intake-skill-contract.md), and [docs/runtime-policy-skill-contract.md](C:/workspace/main_projects/codex-workflow-core/docs/runtime-policy-skill-contract.md)

## Portable Core Slice

- `core/skills/` holds the portable priority skills
- `core/contracts/` holds the normalized output and tool contracts plus the canonical provider capability matrix
- `core/evals/` holds the portable eval scaffolding
- `providers/openai-codex/`, `providers/anthropic-claude/`, `providers/qwen-code/`, and `providers/kimi-k2_5/` are the canonical adapter exports
- `providers/openai/`, `providers/anthropic/`, `providers/qwen/`, `providers/kimi/`, and `providers/codex/` remain compatibility mirrors during migration

## Layout

- `core/` portable core slice
- `contracts/` machine-readable neutral registries and provider capability profiles
- `providers/` provider adapter scaffolds and compatibility exports
- `docs/` portable docs and contracts
- `skills/` reusable shared-exported skills
- `.agents/skills/` repo-local control-plane skills
- `scripts/tools/` deterministic helpers and validators
- `templates/` shared templates
- `examples/` shared examples
