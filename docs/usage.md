# Usage

Class: operational.
Use rule: start here for operator flow, then jump to the canonical docs it references; do not treat this page as the source of truth.

Operational entrypoint for consumer adoption and maintainer work.

## Start Here

1. Read [docs/README.md](C:/workspace/main_projects/codex-workflow-core/docs/README.md) for the docs map.
2. Read [docs/architecture.md](C:/workspace/main_projects/codex-workflow-core/docs/architecture.md).
3. Read [docs/authority-matrix.md](C:/workspace/main_projects/codex-workflow-core/docs/authority-matrix.md).
4. Read [core/README.md](C:/workspace/main_projects/codex-workflow-core/core/README.md) when the task touches the portable core slice.
5. Read [contracts/README.md](C:/workspace/main_projects/codex-workflow-core/contracts/README.md) when the task touches the neutral registry or capability matrix.
6. Read [providers/README.md](C:/workspace/main_projects/codex-workflow-core/providers/README.md) when the task touches provider-specific packaging or export boundaries.
7. Read [evals/README.md](C:/workspace/main_projects/codex-workflow-core/evals/README.md) when the task touches certification fixtures or parity checks.
8. Read [docs/repo-overlay-contract.md](C:/workspace/main_projects/codex-workflow-core/docs/repo-overlay-contract.md) when the task touches shared versus local boundaries.
9. Use [docs/validation-checklist.md](C:/workspace/main_projects/codex-workflow-core/docs/validation-checklist.md) for gates, not for canonical rules.

## Choose The Operational Doc

- First-time adoption: [docs/adoption-playbook.md](C:/workspace/main_projects/codex-workflow-core/docs/adoption-playbook.md)
- Existing consumer refresh or rollout: [docs/consumer-rollout-playbook.md](C:/workspace/main_projects/codex-workflow-core/docs/consumer-rollout-playbook.md)
- Exact maintainer commands: [docs/maintainer-commands.md](C:/workspace/main_projects/codex-workflow-core/docs/maintainer-commands.md)
- Portable skill authoring: [docs/authoring-guides.md](C:/workspace/main_projects/codex-workflow-core/docs/authoring-guides.md)

## Operational Rules

- If a step depends on a validator or script, cite the script path.
- If a guide repeats canonical text, defer to the canonical file instead of copying it here.
- Use [docs/README.md](C:/workspace/main_projects/codex-workflow-core/docs/README.md) as the docs index before choosing a deeper guide.
- Treat [docs/overview.md](C:/workspace/main_projects/codex-workflow-core/docs/overview.md) as summary only, [docs/eval-baseline.md](C:/workspace/main_projects/codex-workflow-core/docs/eval-baseline.md) as derived evidence, and `contracts/core-registry.json` as the machine-readable neutral registry snapshot.
- Treat `providers/<provider>/export.json` as the generated provider export bundle and `evals/catalog.json` as the certification fixture index.
- This class model is logical only; it does not imply physical subdirectories in the repo.
