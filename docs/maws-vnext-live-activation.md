# MAWS vNext Live Activation Runbook

Class: operational.
Status: activation harness implemented; live evidence required.
Owner: model-agnostic-workflow-system.

## Purpose

Close the remaining transport-activation gate for MAWS vNext without expanding authority.

The activation command performs three bounded probes:

1. TypeSafe Jev live typed decision.
2. OpenRouter direct model execution.
3. Locally authenticated Codex CLI execution.

A successful code path is not enough. The activation status becomes `LIVE_ACTIVATION_PASS` only when all three probes pass in the same run.

## Preconditions

Required environment:

```bash
export TYPESAFE_API_KEY="..."
export OPENROUTER_API_KEY="..."
export MAWS_OPENROUTER_MODEL="<explicit OpenRouter model id>"
```

Codex must already be authenticated locally through the normal Codex login state. The activation runner does not copy or persist Codex credentials.

Do not commit any credential values.

## Run

```bash
npm run runtime:activate-vnext
```

The command exits:

- `0` only for `LIVE_ACTIVATION_PASS`
- `2` for a blocked activation

Evidence is written below:

```text
artifacts/runtime-runs/live-activation-*/activation-evidence.json
```

Runtime evidence is local and non-canonical until reviewed.

## Evidence contract

The activation record contains only:

- requested Jev alias and resolved Jev version
- OpenRouter requested model id
- boolean credential-presence checks
- per-probe PASS/BLOCKED state
- normalized error class
- normalized execution metrics/flags
- no API keys
- no Codex auth material
- no raw model prompts beyond the fixed activation probe
- no raw executor output

## Fail-closed rules

Activation is BLOCKED when any of the following occurs:

- TypeSafe credential missing
- OpenRouter credential missing
- explicit OpenRouter model missing
- Jev live request fails
- Jev confidence does not satisfy the deterministic threshold
- OpenRouter execution fails
- OpenRouter serves a different model than requested
- Codex binary/auth/runtime is unavailable
- Codex JSONL output is malformed
- any probe times out or is cancelled

No failed provider is silently substituted.

## Codex live boundary

`codex exec --json` emits JSONL structured events. The MAWS Codex executor parses every non-empty event line independently and fails closed on malformed JSONL.

The activation probe requests read-only behavior and uses the normal restricted Codex execution posture. It does not request `--full-auto`.

## Promotion gate

After a successful activation:

1. preserve the activation evidence path;
2. run the normal vNext and secret gates;
3. update the qualification fingerprint/materiality evidence with the observed Jev resolved model and actual executor runtime state;
4. re-evaluate Registry disposition;
5. only then consider release/Semver promotion.

`LIVE_ACTIVATION_PASS` proves transport activation only. It does not itself grant broader authority or production deployment status.
