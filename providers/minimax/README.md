# MiniMax Provider Adapter

Status: scaffolded.

Provider: MiniMax (minimax.io)
Canonical name: `minimax`
Aliases: `minimax-text`, `abab`, `speech-01`

## Current State

- canonical behavior stays in the portable core
- this adapter compiles the portable core into MiniMax API packaging
- tool calls: native (OpenAI-compatible function calling via `/v1/text/chatcompletion_pro`)
- structured outputs: adapter (JSON mode requires explicit prompt shaping)
- MCP: adapter (no native MCP surface; bridge via HTTP wrapper)
- subagents: adapter (no native agent orchestration)
- speech/TTS: native (MiniMax Speech-01 Turbo via `/v1/t2a_v2`) — not exposed in core skills

## Non-Goals

- no provider-specific behavior becomes canonical here
- speech/TTS capabilities are NOT part of the portable core — they are MiniMax-only
- no JSON-mode assumption may bypass shared schema validation
- raw secrets must never appear in prompt payloads (`raw_secret_prompting_forbidden: true`)

## API Surface

- Base URL: `https://api.minimax.chat`
- Auth: `Authorization: Bearer <MINIMAX_API_KEY>` + `MM-GroupId: <GROUP_ID>`
- Model family: `abab6.5s`, `abab6.5g`, `abab5.5` (chat); `speech-01-turbo` (TTS)
- Tool use format: OpenAI-compatible `functions` / `tools` array
- Streaming: supported via `stream: true`

## Security Constraints (inherited from portable core)

- `raw_secret_prompting_forbidden: true`
- `server_bound_credentials_required: true`
- `provider_switch_requires_reminimization: true`
- `fallback_full_context_reuse_forbidden: true`
- `trace_redaction_required: true`
- `memory_secret_persistence_forbidden: true`

See also: [workflow.md](./workflow.md) — MiniMax Agent Operating Contract
