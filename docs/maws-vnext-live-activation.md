# MAWS vNext Live Activation Runbook

Class: operational.
Status: activation harness implemented; Codex OpenRouter transport wiring live-verified; credential-backed inference evidence still required.
Owner: model-agnostic-workflow-system.

## Purpose

Close the remaining transport-activation gate for MAWS vNext without expanding authority.

The activation command performs three bounded probes:

1. TypeSafe Jev live typed decision.
2. OpenRouter direct model execution.
3. Codex CLI execution with inference routed through the OpenRouter provider.

A successful code path is not enough. The activation status becomes `LIVE_ACTIVATION_PASS` only when all three probes pass in the same run.

## Codex inference path

The Codex CLI is a harness executor, never a model and never a provider. Its
inference is routed through the OpenRouter provider configured in an isolated
`CODEX_HOME`:

```text
MAWS -> exec_codex_harness -> codex exec --json
     -> CODEX_HOME/config.toml (model_provider = openrouter)
     -> OPENROUTER_API_KEY (env_key; never written to any file)
     -> explicit model slug bound via -c model=... from MAWS executor config
```

No Codex ChatGPT login is used or required for this path. The user's normal
`~/.codex` is never mutated: when `CODEX_HOME` is not exported, the runner
bootstraps the repo-local default under `artifacts/codex-home` (gitignored,
MAWS-owned, kept exactly canonical). An externally exported `CODEX_HOME` is
validated against the required OpenRouter provider semantics and is never
rewritten by MAWS.

The executor fails closed before spawning whenever no explicit model binding
exists (`MAWS_CODEX_MODEL` or executor option), so the ambient Codex
login/config can never become an implicit inference fallback. A WorkUnit can
never inject model, provider, or credential configuration.

## Preconditions

Required environment:

```bash
export TYPESAFE_API_KEY="..."
export OPENROUTER_API_KEY="..."
export MAWS_OPENROUTER_MODEL="<explicit OpenRouter model id for the direct executor>"
export MAWS_CODEX_MODEL="<explicit OpenRouter model id for the Codex harness>"
```

Optional environment:

```bash
export MAWS_CODEX_WIRE_API="responses"   # or "chat"; default "responses"
export CODEX_HOME="<absolute path>"      # default: <repo>/artifacts/codex-home (auto-bootstrapped)
```

The Codex binary must be on `PATH`. The activation runner does not copy or
persist Codex credentials and never writes `OPENROUTER_API_KEY` to any file.

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

## Preflight semantics

Per-transport fail-closed checks run before any probe:

Jev: `TYPESAFE_API_KEY` present.

OpenRouter direct: `OPENROUTER_API_KEY` present, `MAWS_OPENROUTER_MODEL` present.

Codex harness: codex binary available and version probed; `CODEX_HOME` resolved
(default bootstrapped or external); `config.toml` contains the required
OpenRouter provider semantics (`model_provider = "openrouter"`, provider block
with `base_url = https://openrouter.ai/api/v1`, `env_key = OPENROUTER_API_KEY`,
`wire_api` matching the knob); `MAWS_CODEX_MODEL` present; `MAWS_CODEX_WIRE_API`
in `{responses, chat}`.

Any failed check blocks with a named blocker (`TYPESAFE_API_KEY_MISSING`,
`OPENROUTER_API_KEY_MISSING`, `MAWS_OPENROUTER_MODEL_MISSING`,
`MAWS_CODEX_MODEL_MISSING`, `CODEX_BINARY_MISSING`, `CODEX_CONFIG_INVALID`,
`CODEX_WIRE_API_INVALID`) and all probes stay `NOT_RUN`.

## Evidence contract

The activation record contains only:

- requested Jev alias and resolved Jev version
- OpenRouter requested model id (direct executor)
- requested Codex model, provider id, codex version, wire api, codex home source
- boolean credential-presence checks
- per-probe PASS/BLOCKED state
- normalized error class and event counters
- no API keys
- no Codex auth material
- no raw model prompts beyond the fixed activation probe
- no raw executor output

## Fail-closed rules

Activation is BLOCKED when any of the following occurs:

- TypeSafe credential missing
- OpenRouter credential missing
- explicit OpenRouter model missing (direct or Codex lane)
- Codex binary unavailable
- Codex provider config missing/invalid
- Jev live request fails
- Jev confidence does not satisfy the deterministic threshold
- OpenRouter execution fails
- OpenRouter serves a different model than requested (direct or Codex lane)
- Codex JSONL output is malformed or contains a terminal `turn.failed` event
- any probe times out or is cancelled

No failed provider is silently substituted. Exit code 0 alone is never
sufficient: terminal failures are classified from the JSONL event stream.

## Codex live boundary

`codex exec --json` emits pure JSONL on stdout (diagnostics go to stderr).
The MAWS Codex executor parses every non-empty event line independently and
fails closed on malformed JSONL. Terminal failure classification follows the
live-observed codex-cli 0.157.0 event vocabulary: a top-level `turn.failed`
event is fatal even when the process exits 0; transient top-level `error`
events (provider reconnects) and nested item errors (model-metadata warnings)
are surfaced as counters, not failures. Served-model identity exposed by the
stream is compared against the bound model and any mismatch blocks
qualification (`MODEL_SUBSTITUTION`), never silently accepted.

The activation probe requests read-only behavior (`--sandbox read-only`) and
does not request `--full-auto` or `danger-full-access`.

## Local verification record (2026-09-25)

Observed on this machine against codex-cli 0.157.0 with the isolated
`artifacts/codex-home`:

- `codex exec --strict-config` accepts the full provider config including
  `requires_openai_auth = false` (no unknown-field rejection).
- Without `OPENROUTER_API_KEY`, codex fails closed with
  `Missing environment variable: OPENROUTER_API_KEY` and a `turn.failed`
  event — proving `env_key` wiring without any secret material.
- With a synthetic invalid key, codex reached
  `https://openrouter.ai/api/v1/responses` and received 401 Unauthorized
  (provider edge trace visible), ending in `turn.failed` — proving the
  complete transport wiring end to end.
- The MAWS executor classified that live run as `FAILED / CODEX_TURN_FAILED`
  with event counters and no credential reflection in the result.

Valid-credential inference (`LIVE_ACTIVATION_PASS`) remains unproven on this
machine: `OPENROUTER_API_KEY` and `TYPESAFE_API_KEY` are not present locally.

## Promotion gate

After a successful activation:

1. preserve the activation evidence path;
2. run the normal vNext and secret gates;
3. update the qualification fingerprint/materiality evidence with the observed Jev resolved model and actual executor runtime state;
4. re-evaluate Registry disposition;
5. only then consider release/Semver promotion.

`LIVE_ACTIVATION_PASS` proves transport activation only. It does not itself grant broader authority or production deployment status.
