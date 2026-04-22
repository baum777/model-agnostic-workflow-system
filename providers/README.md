# Provider Adapters

This directory is the provider-specific export boundary for the shared core.

## Canonical Rule

- Core semantics live in `core/`, `contracts/`, `skills/`, and `scripts/tools/`.
- Canonical provider adapters live in `providers/openai-codex/`, `providers/anthropic-claude/`, `providers/qwen-code/`, and `providers/kimi-k2_5/`.
- Legacy directories under `providers/openai/`, `providers/anthropic/`, `providers/qwen/`, `providers/kimi/`, and `providers/codex/` remain compatibility mirrors until the migration is complete.
- Provider directories compile the canonical portable slice into provider-specific packaging and transport artifacts.
- Provider-specific behavior must not become the source of truth for shared contracts.

## Current Provider Scaffolds

- `providers/openai-codex/` - canonical OpenAI / Codex / GPT export boundary
- `providers/anthropic-claude/` - canonical Claude export boundary
- `providers/qwen-code/` - canonical Qwen Code export boundary
- `providers/kimi-k2_5/` - canonical Kimi K2.5 export boundary
- `providers/openai/` - compatibility export boundary for the legacy OpenAI/Codex surface
- `providers/anthropic/` - compatibility export boundary for the legacy Claude surface
- `providers/qwen/` - compatibility export boundary for the legacy Qwen surface
- `providers/kimi/` - compatibility export boundary for the legacy Kimi surface
- `providers/codex/` - compatibility export boundary for the legacy Codex package surface

## Generated Exports

- `providers/<provider>/export.json` is the generated provider export bundle
- run `npm run build-exports` to regenerate committed export bundles from `core/contracts/core-registry.json`
- run `npm run eval` to validate the committed exports against the certification fixtures

## Compatibility Governance

1. Canonical provider exports are projections of canonical contracts under `core/contracts/*`.
2. Legacy provider directories are compatibility mirrors and must not become semantic authority.
3. Provider-specific packaging may differ, but canonical capability/workflow/tool/output ownership remains in shared-core contracts and policies.

## Release Audit Rule

1. Canonical provider export directories are release-critical derived artifacts.
2. Legacy provider export directories are compatibility-derived artifacts and must not be used to define canonical semantics.
3. Release handoff should report that provider exports were regenerated and validated against canonical contracts before adoption claims.
