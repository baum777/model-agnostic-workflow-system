# Provider Adapters

This directory is the provider-specific export boundary for the shared core.

## Canonical Rule

- Core semantics live in the repository root, `contracts/`, `skills/`, and `scripts/tools/`.
- Provider directories compile those canonical surfaces into provider-specific packaging and transport artifacts.
- Provider-specific behavior must not become the source of truth for shared contracts.

## Current Provider Scaffolds

- `providers/openai/` - OpenAI / Codex / GPT export boundary
- `providers/anthropic/` - Claude export boundary
- `providers/qwen/` - Qwen export boundary
- `providers/kimi/` - Kimi K2.5 export boundary
- `providers/codex/` - compatibility export boundary for the current Codex package surface
