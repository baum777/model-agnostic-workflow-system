# Usage

Use the shared core as a local, materialized package boundary inside a consumer repository.

## Typical Flow

1. Read the repo overlay contract.
2. Read `docs/authority-matrix.md` to confirm claim status (`implemented`, `contract-only`, `planned`, `missing`, `unclear`) before relying on a surface.
3. Initialize or refresh the consumer overlay.
4. If the consumer uses `repo-intake-sot-mapper`, validate `.codex/repo-intake-inputs.json` before mapping the repo.
5. If the consumer uses `runtime-policy-auditor`, validate `.codex/runtime-policy-inputs.json` before auditing runtime policy.
6. Use the planning and review skills for bounded work.
7. Keep write operations approval-gated.
8. Validate before merge or rollout.

## Preferred Entry Points

- `docs/overview.md`
- `docs/adoption-playbook.md`
- `docs/repo-overlay-contract.md`
- `docs/consumer-rollout-playbook.md`
- `docs/lock-model.md`
- `docs/maintainer-commands.md`
- `docs/shared-with-local-inputs.md`
- `docs/authority-matrix.md`
- `docs/eval-baseline.md`
- `scripts/tools/validate-shared-core-package.mjs`
- `scripts/tools/calculate-package-fingerprint.mjs`
- `scripts/tools/validate-runtime-policy-input-contract.mjs`

## Catalog Status Rule

Interpret `docs/tool-contracts/catalog.json` using this fail-closed rule:

- only `implementationStatus: real` with an `entrypoint` should be treated as runnable
- `implementationStatus: contract` and `implementationStatus: stub` are non-runnable declarations
