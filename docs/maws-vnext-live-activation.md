# MAWS vNext Live Activation Runbook

Class: operational.
Status: **LIVE_ACTIVATION_PASS (2026-09-26T01:04Z)** — all three transport lanes live-verified locally (Codex ChatGPT plan, Jev via OpenRouter Decisions API, direct OpenRouter model `deepseek/deepseek-v4.1-flash`). Local activation proof only; no production deployment is claimed.
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

## Codex ChatGPT OAuth lifecycle (auth controller)

`runtime/auth/codex-chatgpt-auth.mjs` owns ONLY auth health classification.
Codex owns the OAuth protocol and the credential store: `~/.codex/auth.json`
is private Codex implementation state — MAWS never reads, parses, copies,
hashes, or persists it, and never decodes tokens. Authentication is NOT
authority: no auth state creates filesystem, network, shell, deployment,
scope, capability, or authority grants.

State machine (explicit, never collapsed):

```text
UNKNOWN -> (binary missing)              CODEX_UNAVAILABLE
        -> (status: not logged in)       NOT_LOGGED_IN
        -> (status: logged in w/ API key) WRONG_AUTH_MODE   # never auto-converted
        -> (status: ChatGPT present)     CHATGPT_STATUS_PRESENT
CHATGPT_STATUS_PRESENT + live probe PASS -> AUTH_HEALTHY
CHATGPT_STATUS_PRESENT + live auth-fail  -> AUTH_STALE      # 401/token-expired class
explicit codex login -> LOGIN_IN_PROGRESS -> (status + probe PASS) AUTHENTICATED
                      -> (command fail)   LOGIN_FAILED      # post-status re-observed
headless/no-TTY or unsupported --device   AUTH_INTERACTION_REQUIRED
```

Critical invariant: `codex login status` == "Logged in using ChatGPT" does
NOT imply usable authenticated execution. CHATGPT_STATUS_PRESENT and
AUTH_HEALTHY are distinct states; only the read-only live probe through the
real executor (phrase `MAWS CODEX AUTH HEALTH PASS`) upgrades to AUTH_HEALTHY,
and an auth-class live failure (401 / unauthorized / token expired /
refresh-token / authentication-required signatures) classifies AUTH_STALE,
not an executor implementation failure.

Safety rules (all test-enforced):

- never auto-logout, never delete auth state, never touch a healthy session
  (`requestLogin` on AUTH_HEALTHY short-circuits with `login_invoked: false`);
- login is explicit-only (`runtime:codex-auth:login`), exactly ONE attempt
  per invocation, no retry loops; activation and check NEVER trigger OAuth;
- the interactive login child runs `stdio: inherit` — MAWS never captures,
  echoes, or persists OAuth output; child env stays PATH/HOME/CODEX_HOME;
- after any login outcome the truth is re-observed (`codex login status` +
  live probe), never assumed; login-command success alone is NOT sufficient
  for AUTHENTICATED;
- `--device-auth` support is discovered from the installed CLI
  (`codex login --help`), never assumed; device mode maps to the official
  `codex login --device-auth`.

Commands and exit codes:

```bash
npm run runtime:codex-auth:check   # non-interactive; never logs in
npm run runtime:codex-auth:login   # explicit interactive official flow
npm run runtime:codex-auth:login -- --device
```

```text
0 = AUTH_HEALTHY / AUTHENTICATED
2 = user authentication required (NOT_LOGGED_IN / WRONG_AUTH_MODE / AUTH_INTERACTION_REQUIRED)
3 = stale or invalid authentication (AUTH_STALE / LOGIN_FAILED)
4 = environment/executor failure (CODEX_UNAVAILABLE / UNKNOWN / probe failure)
```

Receipts are runtime-only (`maws.codex-auth-health.v1`, no core contract):
auth facts only — never tokens, account ids, emails, or OAuth URLs/state.

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
codex_chatgpt:    auth controller verdict AUTH_HEALTHY (binary + version +
                  stored login status + live read-only health probe)
openrouter_jev:   OPENROUTER_API_KEY present, jev model configured
openrouter_model: OPENROUTER_API_KEY present, explicit model configured
```

Blockers: `CODEX_BINARY_MISSING`, `CODEX_AUTH_NOT_LOGGED_IN`,
`CODEX_AUTH_WRONG_MODE`, `CODEX_AUTH_STALE`, `CODEX_AUTH_HEALTH_PROBE_FAILED`,
`CODEX_AUTH_TIMEOUT`, `CODEX_AUTH_STATUS_UNKNOWN`,
`OPENROUTER_API_KEY_MISSING`, `MAWS_JEV_MODEL_MISSING`,
`MAWS_OPENROUTER_MODEL_MISSING`. TYPESAFE_API_KEY is not checked for normal
activation (recorded as presence-only metadata for the compat provider).
Preflight records `codex_login_status`, `codex_auth_mode`,
`codex_auth_health`, and `codex_interaction_required` — no secret values.

The Jev transport probe asks the decidable typed `work_class` question over
its closed answer space; executor preference over a synthetic probe state is
undecidable by design and would force a permanent HUMAN_GATE. Executor
routing is exercised separately by the Jev routing tracer with a real
WorkUnit-shaped state (see evidence
`evidence/codex-chatgpt-auth-controller-2026-09-26/run-jev-routing-tracer.mjs`).

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

## Local verification record (2026-09-26, FINAL: LIVE_ACTIVATION_PASS)

- Credential surface: `~/.config/maws/openrouter.env` (mode 600, sourced by
  `~/.bashrc`/`~/.profile`) exports `OPENROUTER_API_KEY` and
  `MAWS_OPENROUTER_MODEL=deepseek/deepseek-v4.1-flash` (owner-selected,
  catalogue-verified slug).
- `npm run runtime:activate-vnext`: **LIVE_ACTIVATION_PASS, exit 0, zero
  blockers** — codex_chatgpt PASS (auth-health gated, phrase observed);
  openrouter_jev PASS (`work_class`=`verification`, 0.83 ≥ 0.7, snapshot
  `typesafe/jev-1.13-20260917`); openrouter_model PASS (requested == served
  `deepseek/deepseek-v4.1-flash`, no substitution, usage normalized).
- Jev routing tracer PASS end-to-end (DecisionReceipt → threshold PROCEED →
  RoutingDecision NORMAL_SELECTION → ExecutorBinding); Codex tracer PASS with
  the live key present in the parent (child isolation held); model tracer
  PASS. Full-slice CompletionDecision: **COMPLETED**.
- Blocking-defect fix surfaced by the live run: without an explicit
  `max_tokens`, OpenRouter pre-flight-checks the model's full output ceiling
  (e.g. 131072 tokens) against account credit and rejects with HTTP 402 even
  for short acknowledgements. The direct model executor now bounds every
  request (`max_tokens`, default 1024, executor configuration never
  WorkUnit-selectable) and maps HTTP 402 to `OR_PAYMENT_REQUIRED`.
- Attempt history: attempt 1 BLOCKED (key not inherited by agent shells);
  attempt 2 PARTIAL 2/3 (model lane first guardrail-blocked on
  `z-ai/glm-4.7`, then HTTP 402 on the unbounded request after the owner
  relaxed the guardrails and switched to `deepseek/deepseek-v4.1-flash`);
  final attempt PASS. Preserved under
  `evidence/maws-vnext-final-live-closure-2026-09-26/` (`attempt1-*`,
  `attempt2-*`, final PASS set, full-slice completion decision, NO_CHANGE
  registry disposition).

## Local verification record (2026-09-26, auth controller run)

- `npm run runtime:codex-auth:check` (real binary, real login, real live
  probe): **AUTH_HEALTHY**, exit 0; stored status PRESENT, live health PASS,
  `login_invoked: false` — the healthy session was never touched.
- Credential inheritance unblocked via `~/.config/maws/openrouter.env`
  (mode 600, sourced by `~/.bashrc`/`~/.profile`): activation with the key
  present — **codex_chatgpt PASS** and **openrouter_jev PASS live**
  (`work_class`=`verification`, confidence 0.81 ≥ 0.7, resolved snapshot
  `typesafe/jev-1.13-20260917`, DecisionReceipt mode `openrouter`);
  openrouter_model BLOCKED `OR_BAD_RESPONSE` HTTP 404.
- Model-lane diagnosis (see
  `evidence/maws-vnext-final-live-closure-2026-09-26/openrouter-model-evidence.json`):
  the key is valid ($50 credit, usage 0) and `z-ai/glm-4.7` is
  catalogue-listed, but the OpenRouter workspace guardrail/data policy blocks
  chat/completions endpoints account-wide ("Model blocked by guardrail" /
  "Provider not allowed by guardrail", cross-vendor probes identical;
  configurable at https://openrouter.ai/workspaces/default/guardrails).
  The Jev Decisions alpha surface is unaffected. Fail-closed classification
  held: typed `OR_BAD_RESPONSE`, no fallback, no substitution.
- Jev routing tracer: **PASS** — `~typesafe/jev-latest` →
  `typesafe/jev-1.13-20260917`, choice `exec_codex_chatgpt` @ 0.76,
  threshold PROCEED (0.7), DecisionReceipt + RoutingDecision (NORMAL_SELECTION,
  jev-bound) + ExecutorBinding, all live.
- §47 Codex tracer (auth health + JSONL + turn.failed absence + phrase +
  child secret isolation): **PASS** — re-verified with the key present in the
  parent environment (child isolation held).
- §48 CompletionDecision for the auth-controller slice: **COMPLETED**
  (scope-limited to the Codex lane; the model lane is not claimed).

For `LIVE_ACTIVATION_PASS` one owner console action remains: allow at least
one chat model (e.g. `z-ai/glm-4.7`) under the workspace guardrails, then:

```bash
npm run runtime:activate-vnext                  # target: all three lanes PASS
node evidence/codex-chatgpt-auth-controller-2026-09-26/run-openrouter-model-tracer.mjs
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
