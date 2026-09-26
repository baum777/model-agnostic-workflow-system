# Codex ChatGPT OAuth Auth Controller — Implementation and Activation Record (2026-09-26)

Run class: local implementation + activation closure (directive: "CODEX CHATGPT
OAUTH AUTHENTICATION CONTROLLER FULL LOCAL IMPLEMENTATION AND ACTIVATION RUN").
Branch: `codex/maws-vnext-chatgpt-openrouter-routing` (PR #9, additive commits,
base 1a4304a). Registry disposition: **NO_CHANGE** (runtime/test/doc/evidence
only; no `core/contracts/*` touched — see registry-disposition.json, validator
PASS).

## What was built

- `runtime/auth/codex-chatgpt-auth.mjs` — Codex ChatGPT auth controller:
  discovery (binary/version/`codex login status`/`codex login --help`),
  classification (11 explicit states; CHATGPT_STATUS_PRESENT is never collapsed
  into AUTH_HEALTHY), live read-only health probe through the real
  `exec_codex_chatgpt` executor (phrase `MAWS CODEX AUTH HEALTH PASS`), stale
  detection (401 / unauthorized / token-expired / refresh-token /
  authentication-required signatures → `AUTH_STALE`, not executor failure),
  wrong-auth-mode rejection (API-key login is never silently accepted or
  converted), explicit single-attempt official login (`requestLogin`;
  healthy sessions short-circuit untouched; `--device-auth` only when the
  installed CLI proves it; post-login truth re-observed, never assumed),
  headless guard (`AUTH_INTERACTION_REQUIRED`), runtime-only receipt
  `maws.codex-auth-health.v1` (auth facts only, never tokens/account data).
- `runtime/cli/runtime-codex-auth.mjs` + npm scripts
  `runtime:codex-auth:check` (non-interactive, never logs in; exit
  0/2/3/4 = healthy / auth-required / stale-invalid / environment) and
  `runtime:codex-auth:login [-- --device]` (official flow, stdio inherit so
  OAuth output is never captured or echoed by MAWS).
- Activation runner integration: `runtime/activation/live-activation.mjs`
  preflight now runs the auth controller; Codex lane-ready requires
  AUTH_HEALTHY; typed blockers `CODEX_AUTH_NOT_LOGGED_IN`,
  `CODEX_AUTH_WRONG_MODE`, `CODEX_AUTH_STALE`,
  `CODEX_AUTH_HEALTH_PROBE_FAILED`, `CODEX_AUTH_TIMEOUT`,
  `CODEX_AUTH_STATUS_UNKNOWN`; preflight records login status / auth mode /
  auth health / interaction-required (no secret values). Activation never
  triggers OAuth.
- Jev transport probe switched to the decidable typed `work_class` question:
  the owner's live run proved the Decisions transport works (resolved
  snapshot `typesafe/jev-1.13-20260917`) but the executor-preference question
  over a synthetic state is undecidable (0.23 confidence → permanent
  HUMAN_GATE by design). Executor routing is exercised by the §45 routing
  tracer with a real routing state instead.

## Live results (this run, agent shell)

| Gate | Result |
| --- | --- |
| `npm run runtime:codex-auth:check` | **AUTH_HEALTHY**, exit 0 (live probe PASS, login_invoked=false) |
| `npm run runtime:activate-vnext` | **PARTIAL**, exit 1 — codex PASS; OR lanes NOT_RUN (`OPENROUTER_API_KEY_MISSING` in agent shell) |
| §47 Codex tracer | **PASS** (auth health, JSONL valid, turn.failed absent, phrase observed, child secret isolation) |
| §45 Jev routing tracer | NOT_RUN (typed blocker `OPENROUTER_API_KEY_MISSING`; owner re-run instructions embedded) |
| §46 OpenRouter model tracer | NOT_RUN (typed blockers; catalogue-verified model-slug diagnosis, see below) |
| §48 CompletionDecision | **COMPLETED** for the auth-controller slice (scope-limited; OR lanes explicitly not claimed) |

## OpenRouter lane findings (from the owner's 2026-09-26T00:08Z run + catalogue)

1. The owner exported `OPENROUTER_API_KEY` in their terminal session; agent
   shells do not inherit it (verified: not in profile, not in login shell).
   Their run artifact is preserved as
   `owner-run-activation-evidence-2026-09-26T00-08Z.json`.
2. openrouter_jev: live Decisions round-trip proven; confidence 0.23 →
   HUMAN_GATE was the threshold gate correctly refusing an undecidable
   question (fixed by the work_class probe switch).
3. openrouter_model: HTTP 400 `OR_BAD_RESPONSE` with
   `MAWS_OPENROUTER_MODEL=zai/glm-4.7`. Catalogue check (public
   `/api/v1/models`, 459 models, no auth): the slug `zai/glm-4.7` does NOT
   exist; the catalogue lists `z-ai/glm-4.7` (namespace `z-ai`, hyphenated).
   Owner fix: `export MAWS_OPENROUTER_MODEL=z-ai/glm-4.7`.

## Test matrix (§36) — 24 new tests in tests/vnext/codex-chatgpt-auth.test.mjs

binary missing; not logged in; ChatGPT status + probe PASS → AUTH_HEALTHY;
MANDATORY stale fixture (status present + live 401 → AUTH_STALE);
token-expired variant; non-auth failure stays probe-failure; phrase-missing;
login success + health PASS → AUTHENTICATED; login success + health FAIL →
not AUTHENTICATED; login failure with re-observed post-login status; login
timeout (single attempt); device-auth supported (maps to
`codex login --device-auth`); device-auth unsupported (no invocation);
healthy session never re-logged-in (login count 0); check path never logs in;
OPENROUTER/OPENAI/TYPESAFE present in parent, absent from every Codex child
(sentinel material); receipts carry no OAuth-shaped state; status-text
classification units; exit-code mapping units. Activation tests additionally
prove activation never invokes requestLogin (fake controllers throw on it)
and stale/wrong-mode lanes do not mask the OpenRouter lanes.

## Gates

`npm run test:activation` 39/39 exit 0 · `npm run test:vnext` 228/228 exit 0 ·
`npm run validate-maws-vnext` exit 0 · `npm run eval:maws-vnext` exit 0 ·
`npm run validate` / `validate-neutral` / `validate-secrets` / `scan-secrets`
exit 0, 0 findings.

## Remaining owner gates

1. `export OPENROUTER_API_KEY=...` and `export MAWS_OPENROUTER_MODEL=z-ai/glm-4.7`
   in the invoking shell, then `npm run runtime:activate-vnext` (target:
   LIVE_ACTIVATION_PASS) and the two tracer scripts above.
2. Review/merge MAWS PR #9; merge unitera-registry PR #96 (the only registry
   candidate — the pre-existing decision-receipt mode-enum delta).
3. Semver: 0.3.0 recommendation unchanged and still gated on a full
   LIVE_ACTIVATION_PASS; not tagged, not published.
