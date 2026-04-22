# Portability

Class: canonical.
Use rule: read this when deciding whether an asset belongs in the portable core or a provider adapter.

## Portable Core

- `core/skills/` holds portable skills.
- `core/contracts/output-contracts.json` holds normalized output contracts.
- `core/contracts/tool-contracts/catalog.json` holds normalized tool contracts.
- `core/contracts/provider-capabilities.json` holds canonical provider capabilities.
- `core/contracts/provider-capabilities.json` also defines the portability-minimized capability vocabulary used by provider projections.
- `core/evals/` holds portable eval scaffolding and boundary notes.

## Provider Adapters

- `providers/openai-codex/`
- `providers/anthropic-claude/`
- `providers/qwen-code/`
- `providers/kimi-k2_5/`

## Compatibility Surfaces

- top-level `skills/`, `contracts/`, and legacy `providers/<legacy>/` directories remain compatibility mirrors while migration is in progress.

## Rule

- If an asset changes shared semantics, it belongs in `core/`.
- If an asset only projects shared semantics into a provider packaging boundary, it belongs in `providers/`.
- If an asset exists to keep older consumers working, it belongs in a compatibility mirror and must be labeled as such.
- Provider exports must carry capability ownership metadata that points back to canonical capability contracts, not local provider-only semantics.
