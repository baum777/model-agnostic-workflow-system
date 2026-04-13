# Adoption Playbook

Use this playbook for first-time consumer setup.

## Scope

- initialize a consumer overlay
- pin the shared-core version and fingerprint
- add consumer-local input contracts only for adopted shared-with-local-inputs skills
- initialize the consumer-local Qwen bootstrap only if that overlay is adopted

## Canonical Inputs

- [docs/repo-overlay-contract.md](C:/workspace/main_projects/codex-workflow-core/docs/repo-overlay-contract.md)
- [docs/shared-with-local-inputs.md](C:/workspace/main_projects/codex-workflow-core/docs/shared-with-local-inputs.md)
- [docs/repo-intake-skill-contract.md](C:/workspace/main_projects/codex-workflow-core/docs/repo-intake-skill-contract.md)
- [docs/runtime-policy-skill-contract.md](C:/workspace/main_projects/codex-workflow-core/docs/runtime-policy-skill-contract.md)
- [docs/validation-checklist.md](C:/workspace/main_projects/codex-workflow-core/docs/validation-checklist.md)

## Minimal Flow

1. Initialize the consumer overlay from the shared core.
2. Initialize the consumer-local Qwen bootstrap once if the consumer adopts it.
3. Inspect and customize the local overlay and only the contracts the consumer actually adopts.
4. Validate the overlay and stop on missing or invalid local input files or Qwen bootstrap contract failures.
5. Revalidate after each local edit.

## Notes

- Do not treat this playbook as the source of truth for authority claims; use [docs/architecture.md](C:/workspace/main_projects/codex-workflow-core/docs/architecture.md) and [docs/authority-matrix.md](C:/workspace/main_projects/codex-workflow-core/docs/authority-matrix.md).
- Exact commands live in [docs/maintainer-commands.md](C:/workspace/main_projects/codex-workflow-core/docs/maintainer-commands.md).
- The generated `.qwen` tree is a local overlay. Template updates do not automatically propagate into already initialized consumers.
- Qwen runtime claims in the bootstrap resources are advisory-only unless the consumer repo adds a concrete enforcement surface.
