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

## Compatibility Rule

- top-level `contracts/core-registry.json` and `contracts/provider-capabilities.json` are compatibility mirrors while the migration is underway.
- `docs/tool-contracts/catalog.json` remains the compatibility export for the legacy Codex-oriented tool catalog.
