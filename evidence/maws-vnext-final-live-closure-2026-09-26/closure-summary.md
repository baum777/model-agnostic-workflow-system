# MAWS vNext Final Scoped Closure — Attempt 2 Record (2026-09-26T00:53–00:57Z)

Run class: final scoped closure, scope frozen (live runtime + evidence + merge +
Registry gates only). Attempt 1 (BLOCKED: key not inherited) is preserved as
`attempt1-*`; the owner unblocked credential inheritance via
`~/.config/maws/openrouter.env` (mode 600, sourced by `~/.bashrc` and
`~/.profile`; agent shells inherit both exports — verified presence-only).

## Result

```text
PARTIAL — BLOCKED_ON_OWNER_OPENROUTER_GUARDRAIL for the final lane
```

Two of three lanes are now **live PASS**; the remaining blocker is an owner
console configuration on the OpenRouter workspace, not code, not slugs, not
credentials. Per the §28 merge gate (LIVE_ACTIVATION_PASS + all tracers PASS +
full-slice CompletionDecision required), PR #9 was **correctly NOT merged** and
the Registry chain stays untouched.

## Live results (this attempt, all first-party)

| Step | Result |
| --- | --- |
| §9 `runtime:codex-auth:check` | **AUTH_HEALTHY**, exit 0 (live probe PASS, login NOT invoked) → codex-auth-health.json |
| §10 activation | PARTIAL, exit 1 — **codex_chatgpt PASS**; **openrouter_jev PASS** (`work_class`=`verification`, confidence 0.81 ≥ 0.7, snapshot `typesafe/jev-1.13-20260917`, DecisionReceipt `jevr`-mode `openrouter`); openrouter_model BLOCKED (`OR_BAD_RESPONSE`, HTTP 404) → activation-evidence.json |
| §14 Jev routing tracer | **PASS** — requested `~typesafe/jev-latest` → resolved `typesafe/jev-1.13-20260917`; choice `exec_codex_chatgpt` @ 0.76; threshold PROCEED (0.7); DecisionReceipt `jevr_ee683d1ace6e`; RoutingDecision `rd_4cdeaefd9a11` NORMAL_SELECTION (jev-bound); ExecutorBinding `node_repo_analysis` → `exec_codex_chatgpt` (qualification-bound) → jev-routing-evidence.json |
| §16 Codex tracer sanity | **PASS** (AUTH_HEALTHY, JSONL valid, turn.failed absent, phrase observed, child secret isolation) → codex-tracer-evidence.json |
| §15 model tracer / §17 full completion / §24–§33 merge+Registry | NOT reachable — model lane blocked (below) |

## Model-lane diagnosis (openrouter-model-evidence.json)

The key is valid ($50 credit, usage 0) and `z-ai/glm-4.7` is catalogue-listed,
but **the workspace guardrail/data policy blocks chat/completions endpoints
account-wide** — verbatim API error names "Model blocked by guardrail" /
"Provider not allowed by guardrail", configurable at
`https://openrouter.ai/workspaces/default/guardrails`; cross-vendor probes
(z-ai ×2, mistralai, openai) all 404 the same way. The Jev Decisions alpha
surface is unaffected. Fail-closed classification behaved exactly as designed
(typed `OR_BAD_RESPONSE`, no fallback, no substitution).

## Required to continue (single owner console action)

Allow at least one chat model (e.g. `z-ai/glm-4.7`) under
https://openrouter.ai/workspaces/default/guardrails, then re-invoke the
closure run: `npm run runtime:activate-vnext` (slug already configured via the
env file) → expected `LIVE_ACTIVATION_PASS` → model tracer → full-slice
CompletionDecision → PR #9 merge → Registry #96 canonicalization →
MAWS disposition `REQUIRED_BUT_BLOCKED` → `UPDATED` → final closure report.

## Security

No credential value anywhere in this evidence (presence-only facts; API-reported
redacted label only); the Codex child env remains PATH/HOME/CODEX_HOME-only
while the parent carries the inherited key — the isolation invariant held
during live execution.
