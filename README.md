# codex-workflow-core

Class: canonical.
Use rule: use this as the shortest practical entrypoint; it should point to the docs hierarchy rather than duplicate it.

Standalone authoritative shared-core repository for the Codex workflow package.

## Purpose

- provide reusable Codex workflow skills, templates, examples, docs, and helper scripts
- serve as the versioned source of truth for consumer repositories

## Versioning

- package version: `0.1.4`
- compatibility: semver, fail closed on breaking metadata changes
- consumer linkage: file-path reference plus explicit version and fingerprint pin

## Start Here

- [docs/architecture.md](C:/workspace/main_projects/codex-workflow-core/docs/architecture.md)
- [docs/authority-matrix.md](C:/workspace/main_projects/codex-workflow-core/docs/authority-matrix.md)
- [docs/usage.md](C:/workspace/main_projects/codex-workflow-core/docs/usage.md)
- [AGENTS.md](C:/workspace/main_projects/codex-workflow-core/AGENTS.md)

## Operational Commands

- use the command appendix in [docs/maintainer-commands.md](C:/workspace/main_projects/codex-workflow-core/docs/maintainer-commands.md)
- run `npm run validate` before trust or release decisions
- run `npm run fingerprint` when the package state must be pinned
 
## Parameterized Skills

- `repo-intake-sot-mapper` uses a consumer-local input contract declared in `.codex/repo-intake-inputs.json`
- `runtime-policy-auditor` uses a consumer-local input contract declared in `.codex/runtime-policy-inputs.json`
- contract rules live in [docs/shared-with-local-inputs.md](C:/workspace/main_projects/codex-workflow-core/docs/shared-with-local-inputs.md), [docs/repo-intake-skill-contract.md](C:/workspace/main_projects/codex-workflow-core/docs/repo-intake-skill-contract.md), and [docs/runtime-policy-skill-contract.md](C:/workspace/main_projects/codex-workflow-core/docs/runtime-policy-skill-contract.md)

## Layout

- `docs/` portable docs and contracts
- `skills/` reusable skills
- `scripts/tools/` deterministic helpers and validators
- `templates/` shared templates
- `examples/` shared examples
