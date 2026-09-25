# Codex-through-OpenRouter Local Discovery and Activation Record

Class: run evidence (local, non-canonical until reviewed).
Run date: 2026-09-25.
Branch: `codex/maws-vnext-openrouter-live` (base `origin/main` 32f6a52).
Machine: local workstation, Node v24.19.0, npm 11.17.0.

## Local runtime

```text
codex path:    /home/baum/.local/bin/codex
codex version: codex-cli 0.157.0
CODEX_HOME:    <repo>/artifacts/codex-home (gitignored, MAWS-owned default)
wire_api:      responses (knob MAWS_CODEX_WIRE_API, default responses)
```

## Credential posture (presence checks only, no values)

```text
OPENROUTER_API_KEY = MISSING  (env, shell profiles, /etc/environment, repo .env, config dirs swept)
TYPESAFE_API_KEY   = MISSING  (same sweep)
MAWS_OPENROUTER_MODEL / MAWS_CODEX_MODEL = unset
```

`~/.codex/auth.json` holds a ChatGPT login; it is NOT used by this lane (isolated
CODEX_HOME; forbidden as an OpenRouter substitute by run contract).

## Provider config support (empirical, codex-cli 0.157.0)

Isolated `CODEX_HOME/config.toml` with `model_provider = "openrouter"`,
`[model_providers.openrouter]` (`name`, `base_url = https://openrouter.ai/api/v1`,
`env_key = "OPENROUTER_API_KEY"`, `wire_api`, `requires_openai_auth = false`)
was accepted by `codex exec --strict-config` — no unknown-field rejection, so all
used fields (including `requires_openai_auth`) are supported by this version.

Probe T1 (no key): codex failed closed with event stream

```text
{"type":"thread.started",...}
{"type":"item.completed","item":{"type":"error","message":"Model metadata for `zai/glm-4.7` not found. Defaulting to fallback metadata..."}}
{"type":"turn.started"}
{"type":"error","message":"Missing environment variable: `OPENROUTER_API_KEY`."}
{"type":"turn.failed","error":{"message":"Missing environment variable: `OPENROUTER_API_KEY`."}}
```

stdout is pure JSONL (diagnostics on stderr); process exit 1. This proves
`env_key` wiring and provider selection without any secret material.

Probe T2 (synthetic clearly-invalid key — value redacted from this record; it
is not and never was a valid credential, and it is never printed in outputs):
codex reached `https://openrouter.ai/api/v1/responses` and
received `401 Unauthorized: User not found.` (provider edge `cf-ray` visible),
retried 5x (`Reconnecting... n/5`), ended in `turn.failed`. This proves the
complete transport wiring end to end (provider block -> base_url -> wire_api
endpoint -> Authorization from env_key -> OpenRouter response).

## Executor live integration (real binary, synthetic credential)

`exec_codex_harness` executed against the real codex binary with model binding
`zai/glm-4.7`, `--sandbox read-only`, isolated CODEX_HOME, synthetic key:

```json
{
  "outcome": "FAILED",
  "error_class": "CODEX_TURN_FAILED",
  "exit_code": 1,
  "flags": {
    "stream_format": "jsonl",
    "event_count": 10,
    "error_event_count": 6,
    "item_error_count": 1,
    "turn_failed_message": "unexpected status 401 Unauthorized: User not found., url: https://openrouter.ai/api/v1/responses, cf-ray: ...FRA"
  },
  "latency_ms": 10001,
  "executor_id": "exec_codex_harness",
  "key_leaked": false
}
```

Classification and event counters come from the live JSONL stream; the synthetic
key never appears in any result (secret-reflection check negative).

## Activation runner (real run, no credentials)

`npm run runtime:activate-vnext` -> exit 2, status `BLOCKED`, blockers
`TYPESAFE_API_KEY_MISSING`, `OPENROUTER_API_KEY_MISSING`,
`MAWS_OPENROUTER_MODEL_MISSING`, `MAWS_CODEX_MODEL_MISSING`; codex preflight
detected binary + version 0.157.0, bootstrapped and validated the default
CODEX_HOME config; all probes `NOT_RUN` (fail closed before any live call).
Evidence: `activation-evidence.json` next to this record.

## Verification gates

```text
npm run test:activation        15/15 pass
npm run test:vnext            194/194 pass
npm run validate-maws-vnext   exit 0, issues []
npm run eval:maws-vnext       exit 0
npm run validate              exit 0, issues []
npm run validate-neutral      exit 0, issueCount 0
npm run validate-secrets      exit 0, issueCount 0
npm run scan-secrets          exit 0, findingCount 0
```

`npm run eval` (full) is environment-blocked, not a MAWS regression: the runner
crashes with `spawn ~/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome
ENOENT` (Playwright browser binary absent on this machine) during the
render/a11y preflight, before MAWS-unrelated eval families run. Reproduced once
(deterministic missing binary), classified as ENVIRONMENT_BLOCKED_BROWSER, and
excluded from this run's claims. The vNext-relevant eval family
(`eval:maws-vnext`) passes.

## Boundaries held

```text
ZCode = interaction surface (unchanged; zcode.test.mjs 7/7 in suite)
session model never binds executor (session_model_can_bind: false)
WorkUnit cannot inject model/provider/secret config (negative test)
no ChatGPT login on the OpenRouter path (isolated CODEX_HOME + binding gate)
OPENROUTER_API_KEY env-only; allowlist PATH/HOME/CODEX_HOME/OPENROUTER_API_KEY
no silent provider fallback; model substitution blocks qualification
execution != completion (CompletionContract suite unchanged, passing)
```

## Remaining gate (exact blocker)

`OPENROUTER_API_KEY` and `TYPESAFE_API_KEY` (plus owner-chosen
`MAWS_OPENROUTER_MODEL` / `MAWS_CODEX_MODEL` slugs) must be exported by the
owner; then re-run `npm run runtime:activate-vnext` for the credential-backed
PASS evidence. Nothing else in this lane is code-blocked.
