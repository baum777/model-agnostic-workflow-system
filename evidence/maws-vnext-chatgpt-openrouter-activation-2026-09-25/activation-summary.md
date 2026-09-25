# ChatGPT + OpenRouter Routing — Corrective Activation Record

Class: run evidence (local, non-canonical until reviewed).
Run date: 2026-09-25.
Branch: `codex/maws-vnext-chatgpt-openrouter-routing` (base: local activation head
`b2e40b6` on `codex/maws-vnext-openrouter-live`, which preserved the five
OpenRouter-lane commits; origin/main base remains `32f6a52`).

## Architecture correction applied

```text
ALT (previous local lane):  Codex -> OpenRouter provider; Jev -> TypeSafe API (TYPESAFE_API_KEY)
NEU (this run):             Codex -> ChatGPT OAuth -> ChatGPT Codex plan
                            Jev   -> OpenRouter Decisions API (OPENROUTER_API_KEY only)
                            other models -> OpenRouter
```

TYPESAFE_API_KEY is no longer required by the default MAWS live path (direct
TypeSafe stays as optional compat provider, mode `live`). Credential set for
target operation: ChatGPT OAuth session + `OPENROUTER_API_KEY`.

## Verified provider facts (2026-09-25)

- Codex CLI 0.157.0 (`/home/baum/.local/bin/codex`), `codex login status` =
  "Logged in using ChatGPT"; OAuth session lives in the user's default
  CODEX_HOME and is never copied or committed.
- OpenRouter Decisions API (verified against live-documented tutorial +
  SDK docs, `docs/guides/community/jev-tutorial.md`):
  `POST https://openrouter.ai/api/alpha/decisions`, Bearer
  `OPENROUTER_API_KEY`; request `{model, state, questions:{[id]:{type:
  "choice", instructions, criteria}}}`; response `{id, model: <dated
  snapshot>, provider, answers:{[id]:{type, choice, confidence,
  probabilities}}, usage:{input_tokens, output_tokens, cost}}`.
  Jev: `typesafe/jev-1.13`, alias `~typesafe/jev-latest`. Decision models
  are NOT part of the public `/api/v1/models` catalogue (459 models, no
  typesafe/jev entries) — the Decisions API is a separate alpha surface.
- Model-resolution machinery extended: OpenRouter dated snapshots
  (`typesafe/jev-1.13-20260917`) classify as concrete versions; snapshot
  drift under one alias is MATERIAL (fail-closed until requalified).

## Implementation

- `runtime/executors/codex-executor.mjs`: `exec_codex_chatgpt`
  (authMode chatgpt; env allowlist PATH/HOME/CODEX_HOME — NO provider
  keys; optional explicit model via `-m`; optional `--sandbox`); all
  JSONL/`turn.failed` fail-closed fixes from the previous lane preserved.
- `runtime/decision-engine/jev/openrouter-decisions.mjs`:
  OpenRouterDecisionClient with verified contract, typed error mapping
  (JEV_UNAUTHORIZED / JEV_PAYMENT_REQUIRED / JEV_RATE_LIMITED /
  JEV_UNAVAILABLE / JEV_BAD_RESPONSE / JEV_API_KEY_MISSING), host
  allowlist, no chat/completions substitution, no secret reflection.
- `runtime/decision-engine/jev/client.mjs`: mode `openrouter` (canonical
  live path) integrated into the existing validation/threshold/receipt
  machinery; direct TypeSafe kept as compat mode `live`.
- `core/contracts/decision-receipt.schema.json` + decision-receipt.mjs:
  receipt mode enum additively extended with `openrouter`
  (CONTRACT_RECORD change — see registry disposition).
- `runtime/executors/registry.default.json` + eval fixtures: executor id
  renamed `exec_codex_harness` -> `exec_codex_chatgpt` with auth/billing
  metadata in the declaration notes.
- `runtime/activation/live-activation.mjs`: three INDEPENDENT probes
  (codex_chatgpt / openrouter_jev / openrouter_model) with per-lane
  preflight (binary, ChatGPT auth, OR key, models); status
  LIVE_ACTIVATION_PASS / PARTIAL / BLOCKED; CLI exits 0/1/2; Codex PASS
  requires the exact probe phrase in an agent_message event.

## Live evidence

1. Codex ChatGPT plan probe (real executor -> real binary -> real plan
   inference): `SUCCESS`, exit 0, 4 JSONL events, phrase
   `MAWS CODEX CHATGPT AUTH PASS` observed, ~5-8 s, no OpenRouter/OpenAI
   key anywhere in the child env.
2. Codex bounded write tracer (temporary fixture repository, workspace-write
   sandbox confined to the fixture): `hello.txt` created with EXACTLY
   `MAWS CODEX PLAN PASS`; independent deterministic byte verification
   PASS (executor self-report not accepted as verification; Execution !=
   Completion). Fixture deleted after evidence retention.
3. Real activation run `npm run runtime:activate-vnext`: exit 1, status
   `PARTIAL` — codex_chatgpt PASS; openrouter_jev / openrouter_model
   NOT_RUN (`OPENROUTER_API_KEY` absent on this machine). Evidence:
   `activation-evidence.json` next to this record.

## Verification gates

```text
npm run test:activation        13/13 pass
npm run test:vnext            202/202 pass (incl. new openrouter-decisions suite
                               and secret-boundary tests for the ChatGPT codex env)
npm run validate-maws-vnext   exit 0 (authority-matrix drift check included)
npm run eval:maws-vnext       exit 0
npm run validate / validate-neutral / validate-secrets / scan-secrets  all exit 0, 0 findings
npm run eval (full)           ENVIRONMENT_BLOCKED_BROWSER (playwright chromium binary
                              ENOENT; pre-existing, unrelated; not a MAWS regression)
```

## Credential status (presence only)

```text
ChatGPT OAuth (codex login) = PRESENT, live-verified
OPENROUTER_API_KEY          = MISSING on this machine (jev + model lanes blocked)
TYPESAFE_API_KEY            = MISSING (no longer required for the default path)
```

## Remaining gates

Owner exports `OPENROUTER_API_KEY` (+ chosen `MAWS_OPENROUTER_MODEL`; jev
model defaults to `~typesafe/jev-latest`) -> re-run
`npm run runtime:activate-vnext` for `LIVE_ACTIVATION_PASS`, then the Jev
routing tracer and OpenRouter model tracer become executable.
