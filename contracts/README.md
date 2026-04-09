# Contracts

Canonical machine-readable registries live here.

## Current Surfaces

- `contracts/core-registry.json` - neutral skill, tool, and provider registry snapshot
- `contracts/provider-capabilities.json` - provider capability matrix used by the registry builder and validator

## Compatibility Rules

- `docs/tool-contracts/catalog.json` remains the compatibility export for the current Codex-oriented tool catalog.
- `providers/` owns adapter-specific packaging boundaries.
- The registry builder and validator must stay fail-closed if a declared surface is missing.
