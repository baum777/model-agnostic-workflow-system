# MAWS vNext Live Activation Runbook

Class: operational.
Status: ChatGPT Codex plan lane LIVE_VERIFIED_LOCAL; OpenRouter lanes implemented, credential-blocked locally.
Owner: model-agnostic-workflow-system.

## Purpose

Close the remaining transport-activation gate for MAWS vNext without expanding authority.

The activation command performs three INDEPENDENT bounded probes:

1. `codex_chatgpt` — Codex CLI on the owner's ChatGPT Codex plan.
2. `openrouter_jev` — TypeSafe Jev through the OpenRouter Decisions API.
3. `openrouter_model` — direct OpenRouter model executor.

Each probe reports PASS / BLOCKED / NOT_RUN against its own preflight, so one
blocked lane never masks another. `LIVE_ACTIVATION_PASS` requires all three
to PASS; `PARTIAL` means at least one PASSed; `BLOCKED` means none ran.

## Provider topology (frozen)

```text
Codex CLI        = ChatGPT-authenticated agent harness (chatgpt_oauth,
                   billing chatgpt_plan; NO OpenRouter/OpenAI API key)
OpenRouter       = single API provider for Jev (Decisions API) and other
                   qualified model executors (OPENROUTER_API_KEY only)
TypeSafe direct  = optional compatibility provider (mode "live"), not the
                   default live path; TYPESAFE_API_KEY is NOT required
```

## Preconditions

Codex lane: codex binary on PATH, `codex login status` reporting an active
ChatGPT login. The ChatGPT OAuth session stays in the user's CODEX_HOME
(default `~/.codex`); MAWS never copies, commits, or exposes it. An isolated
`CODEX_HOME` may be exported, but then that home must carry its own login.

OpenRouter lanes:

```bash
export OPENROUTER_API_KEY="..."
export MAWS_OPENROUTER_MODEL="<explicit model id for the direct executor>"
export MAWS_JEV_MODEL="~typesafe/jev-latest"   # optional; default alias
```

Jev is called ONLY through the OpenRouter Decisions API
(`POST https://openrouter.ai/api/alpha/decisions`, verified 2026-09-25
against the live-documented tutorial response), never through
chat/completions. Decision models are not listed in the public
`/api/v1/models` catalogue; availability surfaces through this API's own
typed errors. The response `model` field names the dated snapshot that
served the request; requested alias vs resolved snapshot is recorded in the
decision receipt and drift-classified (`MODEL_RESOLUTION` machinery: a
changed snapshot is MATERIAL until requalified).

## Run

```bash
npm run runtime:activate-vnext
```

Exit codes: `0` = LIVE_ACTIVATION_PASS, `1` = PARTIAL, `2` = BLOCKED.

Evidence is written below (untracked until reviewed):

```text
artifacts/runtime-runs/live-activation-*/activation-evidence.json
```

## Preflight semantics

```text
codex_chatgpt:    binary present, version probed, ChatGPT auth present
openrouter_jev:   OPENROUTER_API_KEY present, jev model configured
openrouter_model: OPENROUTER_API_KEY present, explicit model configured
```

Blockers: `CODEX_BINARY_MISSING`, `CODEX_CHATGPT_AUTH_MISSING`,
`OPENROUTER_API_KEY_MISSING`, `MAWS_JEV_MODEL_MISSING`,
`MAWS_OPENROUTER_MODEL_MISSING`. TYPESAFE_API_KEY is not checked for normal
activation (recorded as presence-only metadata for the compat provider).

## Codex probe contract

The probe objective requests the exact phrase `MAWS CODEX CHATGPT AUTH PASS`
under `--sandbox read-only`; PASS additionally requires the phrase to be
observed in an `agent_message` event (executor self-report alone is
insufficient). Recorded per probe: codex_version, auth_class, billing_class,
executor_id, event counters, latency, served model where the stream exposes
it. Authentication is executor configuration (`authMode: "chatgpt"`); a
WorkUnit can never select credentials, auth mode, provider, or model.

## Fail-closed rules

- `turn.failed` in the JSONL stream is fatal even with exit code 0
  (`CODEX_TURN_FAILED`); malformed JSONL is `OUTPUT_INVALID`.
- OpenRouter/Jev errors map to typed classes (`JEV_UNAUTHORIZED`,
  `JEV_PAYMENT_REQUIRED`, `JEV_RATE_LIMITED`, `JEV_UNAVAILABLE`,
  `JEV_BAD_RESPONSE`, `JEV_API_KEY_MISSING`).
- Jev answers outside the offered executor ids are `ANSWER_OUTSIDE_ALLOWED_SPACE`.
- Model substitution (served != requested, where observable) blocks
  qualification; no silent provider fallback, ever.
- Threshold policy stays deterministic code; low confidence never widens
  authority.

## Secret boundaries (tested)

```text
codex child env      = PATH, HOME, CODEX_HOME only (no OPENROUTER/TYPESAFE/OPENAI key)
openrouter clients   = OPENROUTER_API_KEY env-bound only (no Codex OAuth material)
receipts / evidence  = neither secret class ever appears
```

## Local verification record (2026-09-25)

- Codex ChatGPT plan probe (real executor, real binary, real plan
  inference): SUCCESS, exact phrase observed, ~5-8 s, exit 0 — no
  OpenRouter credential involved.
- Codex bounded write tracer in a temporary fixture repository
  (workspace-write sandbox confined to the fixture): `hello.txt` created
  with EXACTLY `MAWS CODEX PLAN PASS`; deterministic byte verification PASS
  (executor self-report was not accepted as verification). Fixture deleted
  after evidence retention.
- Real activation run: `PARTIAL` (codex_chatgpt PASS; openrouter lanes
  NOT_RUN — `OPENROUTER_API_KEY` absent on this machine).
- Decisions API contract implemented against the live-documented shape and
  exercised by fixture tests mirroring the captured response.

`LIVE_ACTIVATION_PASS` remains unproven locally until `OPENROUTER_API_KEY`
(and an explicit `MAWS_OPENROUTER_MODEL`) are provided by the owner.

## Promotion gate

After a successful activation: preserve evidence, run the normal vNext and
secret gates, update qualification fingerprints with observed resolved
models, re-evaluate Registry disposition, then consider release/Semver.
`LIVE_ACTIVATION_PASS` proves transport activation only; it grants no
broader authority and no production deployment status.
