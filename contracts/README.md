# Contracts

Canonical machine-readable registries live here.

## Current Surfaces

- `core/contracts/core-registry.json` - canonical neutral skill, tool, and provider registry snapshot
- `core/contracts/provider-capabilities.json` - canonical provider capability matrix used by the registry builder and validator
- `core/contracts/output-contracts.json` - normalized output contracts for the portable skills
- `core/contracts/tool-contracts/catalog.json` - normalized tool contract catalog for the portable core
- `contracts/core-registry.json` and `contracts/provider-capabilities.json` - compatibility mirrors during the migration

## Compatibility Rules

- `docs/tool-contracts/catalog.json` remains the compatibility export for the current Codex-oriented tool catalog.
- `providers/` owns adapter-specific packaging boundaries.
- canonical provider adapters live under `providers/openai-codex/`, `providers/anthropic-claude/`, `providers/qwen-code/`, and `providers/kimi-k2_5/`.
- The registry builder and validator must stay fail-closed if a declared surface is missing.

## Consumer Adoption Rule

1. Consumers should treat `core/contracts/*` as canonical machine-readable source.
2. `contracts/*` entries are compatibility mirrors and must be regenerated from canonical sources.
3. If a consumer or maintainer edits a mirror directly, regenerate and validate before merge.

## Required Build And Validation Gate

1. `npm run build-registry`
2. `npm run build-exports`
3. `npm run validate`
4. `npm run validate-neutral`
5. `npm run eval`
