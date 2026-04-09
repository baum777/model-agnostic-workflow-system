# codex-workflow-core

Class: canonical.
Use rule: use this as the shortest practical entrypoint; it should point to the docs hierarchy rather than duplicate it.

Standalone authoritative shared-core repository for the provider-neutral agent workflow core, with Codex kept as a compatibility export.

## Purpose

- provide reusable workflow skills, templates, examples, docs, helper scripts, and provider adapter scaffolds
- serve as the versioned source of truth for consumer repositories and compatibility exports

## Versioning

- package version: `0.2.0`
- compatibility: semver, fail closed on breaking metadata changes
- consumer linkage: file-path reference plus explicit version and fingerprint pin

## Start Here

- [docs/architecture.md](C:/workspace/main_projects/codex-workflow-core/docs/architecture.md)
- [docs/authority-matrix.md](C:/workspace/main_projects/codex-workflow-core/docs/authority-matrix.md)
- [docs/usage.md](C:/workspace/main_projects/codex-workflow-core/docs/usage.md)
- [AGENTS.md](C:/workspace/main_projects/codex-workflow-core/AGENTS.md)
- [contracts/README.md](C:/workspace/main_projects/codex-workflow-core/contracts/README.md)
- [providers/README.md](C:/workspace/main_projects/codex-workflow-core/providers/README.md)

## Operational Commands

- use the command appendix in [docs/maintainer-commands.md](C:/workspace/main_projects/codex-workflow-core/docs/maintainer-commands.md)
- run `npm run validate` before trust or release decisions
- run `npm run validate-neutral` when the neutral registry or provider scaffolds change
- run `npm run fingerprint` when the package state must be pinned
 
## Parameterized Skills

- `repo-intake-sot-mapper` uses a consumer-local input contract declared in `.codex/repo-intake-inputs.json`
- `runtime-policy-auditor` uses a consumer-local input contract declared in `.codex/runtime-policy-inputs.json`
- contract rules live in [docs/shared-with-local-inputs.md](C:/workspace/main_projects/codex-workflow-core/docs/shared-with-local-inputs.md), [docs/repo-intake-skill-contract.md](C:/workspace/main_projects/codex-workflow-core/docs/repo-intake-skill-contract.md), and [docs/runtime-policy-skill-contract.md](C:/workspace/main_projects/codex-workflow-core/docs/runtime-policy-skill-contract.md)

## Layout

- `contracts/` machine-readable neutral registries and provider capability profiles
- `providers/` provider adapter scaffolds and compatibility exports
- `docs/` portable docs and contracts
- `skills/` reusable skills
- `scripts/tools/` deterministic helpers and validators
- `templates/` shared templates
- `examples/` shared examples
