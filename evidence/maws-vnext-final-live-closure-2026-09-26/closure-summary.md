# MAWS vNext Final Scoped Closure — PASS RECORD (2026-09-26T01:04Z)

Run class: final scoped closure, scope frozen. Attempt history preserved:
attempt 1 (key not inherited by agent shells), attempt 2 (2/3 lanes live;
model lane blocked first by workspace guardrails, then by HTTP 402 credit
pre-flight on the unbounded request). This record closes the chain.

## Result

```text
LIVE_ACTIVATION_PASS  ·  CompletionDecision COMPLETED (full slice)
```

## The two blockers and their resolutions

1. **Credential inheritance** — owner moved the secret to
   `~/.config/maws/openrouter.env` (mode 600, sourced by `~/.bashrc` and
   `~/.profile`); agent shells inherit both exports.
2. **Model lane** — owner switched the model to `deepseek/deepseek-v4.1-flash`
   (catalogue-verified slug; the earlier `z-ai/glm-4.7` was guardrail-blocked,
   and the guardrail relaxation surfaced the next layer: HTTP 402, because an
   unbounded request forces OpenRouter to pre-flight the full 131072-token
   output ceiling against the account credit). Fixed in-repo by bounding the
   executor request (`max_tokens`, default 1024, executor configuration never
   WorkUnit-selectable) and typing HTTP 402 as `OR_PAYMENT_REQUIRED`.

## Final live evidence (all first-party, this run)

| Gate | Result |
| --- | --- |
| `runtime:codex-auth:check` | **AUTH_HEALTHY**, exit 0 (login NOT invoked) |
| `runtime:activate-vnext` | **LIVE_ACTIVATION_PASS**, exit 0, zero blockers |
| codex_chatgpt | PASS (auth-health gated, phrase observed) |
| openrouter_jev | PASS — `work_class`=`verification`, confidence 0.83 ≥ 0.7, snapshot `typesafe/jev-1.13-20260917`, DecisionReceipt mode `openrouter` |
| openrouter_model | PASS — requested `deepseek/deepseek-v4.1-flash` = served (no substitution), tokens 125/172, cost $0.0001368 |
| Jev routing tracer | **PASS** — `~typesafe/jev-latest` → `typesafe/jev-1.13-20260917`, choice `exec_codex_chatgpt` @ 0.76, threshold PROCEED (0.7), DecisionReceipt `jevr_ee683d1ace6e` → RoutingDecision `rd_4cdeaefd9a11` (NORMAL_SELECTION, jev-bound) → ExecutorBinding `node_repo_analysis` → `exec_codex_chatgpt` |
| Codex tracer | **PASS** (AUTH_HEALTHY, JSONL valid, turn.failed absent, phrase observed, child secret isolation with the key present in the parent) |
| OpenRouter model tracer | **PASS** (requested == served, `model_substitution=false`) |
| Full-slice CompletionDecision | **COMPLETED** (execution + outputs + evidence + independent verification receipt `exec_local_tests`; scope covers all lanes and tracers) |

## Validation

`test:activation` 39/39 · `test:vnext` 230/230 · `validate-maws-vnext` ok ·
`eval:maws-vnext` all blocking suites passed · `validate` / `validate-neutral`
ok · `validate-secrets` 0 · `scan-secrets` 0 · full `npm run eval` =
ENVIRONMENT_BLOCKED_BROWSER (pre-existing Playwright chromium absence,
classified, not a MAWS regression) · evidence secret sweep clean (no key
literals, no bearer/token patterns) · registry disposition validator PASS
(**NO_CHANGE**; PR #96 remains the sole registry candidate).

## Security

OPENROUTER_API_KEY stayed env-bound end-to-end (env file mode 600; never in
git, evidence, receipts, or child environments); the Codex child env remained
PATH/HOME/CODEX_HOME-only while the parent carried the live key. OAuth storage
untouched (Codex-owned; `auth.json` never read; healthy session never
re-logged-in).
