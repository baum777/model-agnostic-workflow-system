# Provider Capability Matrix

Class: canonical.
Use rule: read this for the canonical provider names, aliases, and packaging expectations.

## Portability Vocabulary

Canonical provider capability states are portability-minimized and shared across providers:

- `native`
- `adapter`
- `unsupported`

These states apply to the normalized capability fields in `core/contracts/provider-capabilities.json`:

- `toolUse`
- `structuredOutputs`
- `mcp`
- `subagents`

## Canonical Providers

- `openai-codex`
- `anthropic-claude`
- `qwen-code`
- `kimi-k2_5`

## Compatibility Aliases

- `openai`
- `codex`
- `gpt`
- `anthropic`
- `claude`
- `qwen`
- `qwen-agent`
- `kimi`
- `kimi-k2.5`
- `moonshot`

## Rule

- provider capability data lives in `core/contracts/provider-capabilities.json`
- legacy provider directories are compatibility mirrors, not canonical authorities
- provider exports under `providers/*/export.json` are derived projections and must not invent independent capability vocabularies

## Maturity Posture

- `prose-governed`: this matrix and portability guidance.
- `contract-backed`: capability state model in `core/contracts/provider-capabilities.json`.
- `validator-backed`: cross-surface checks in `scripts/tools/validate-provider-neutral-core.mjs` and `scripts/tools/validate-secret-boundaries.mjs`.
- `runtime-implemented`: bounded to generated provider export artifacts and validator/eval runs.
