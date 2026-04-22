# Core Contracts

Canonical machine-readable contracts for the portable slice.

## Canonical Files

- `core/contracts/portable-skill-manifest.json`
- `core/contracts/output-contracts.json`
- `core/contracts/tool-contracts/catalog.json`
- `core/contracts/provider-capabilities.json`
- `core/contracts/core-registry.json`
- `core/contracts/workflow-routing-map.json`

Execution evidence and certification artifact contracts are defined in `core/contracts/output-contracts.json`.

## Safe Extension Flow

1. Update canonical contract(s) in this folder first.
2. Regenerate derived artifacts with `npm run build-registry` and, when needed, `npm run build-exports`.
3. Validate with `npm run validate`, `npm run validate-neutral`, and `npm run eval`.
4. Only then update operational docs/templates/examples that reference changed fields.

## Compatibility Rule

- top-level `contracts/core-registry.json` and `contracts/provider-capabilities.json` are compatibility mirrors while migration is underway.
- `docs/tool-contracts/catalog.json` remains compatibility/export for the legacy tool catalog view.
- compatibility/export mirrors must not introduce canonical-only semantics absent from `core/contracts/*`.

## Maturity Posture

- `prose-governed`: this index and extension guidance.
- `contract-backed`: JSON contracts in this directory.
- `validator-backed`: `scripts/tools/validate-provider-neutral-core.mjs` and `scripts/tools/validate-shared-core-scaffold.mjs`.
- `runtime-implemented`: limited to build/validation scripts that consume and project these contracts.
