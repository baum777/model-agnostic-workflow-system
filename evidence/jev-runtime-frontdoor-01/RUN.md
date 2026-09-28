# JEV-RUNTIME-FRONTDOOR-01 — Run Record

- **Date:** 2026-09-28
- **Task class:** shared-core implementation slice (MAWS vNext decision plane)
- **Base SHA:** `5400d4d` (JEV-ZEN-TRANSPORT-01; left unchanged — this slice is a separate commit on top)
- **Branch:** `session/jev-zen-transport-01` (session worktree `runtime/worktrees/maws-jev-zen-01`)
- **Owner decision basis:** Owner-Go für Slice 2 (owner chat 2026-09-28) mit explizitem MUST/MUST-NOT-Scope und 5-Punkt-DoD; Slice-Trennung per OD-19 item 5.

## Scope (implemented)

`runtime/cli/runtime-jev-decide.mjs` + npm script `runtime:jev-decide` — thin governed frontdoor:

- Calls ONLY the canonical MAWS Jev client; questions come exclusively from the canonical question registry; choices ARE the declared answer space (CLI cannot widen, cannot invent); threshold policy loaded exclusively from `policies/decision-thresholds.yaml`.
- Modes: `fixture | live | openrouter | zen`. No fallback between transports, no batching, no inference of missing candidates, no `next_action`, no secret exposure (keys via env only, never in output).
- The dynamic `preferred_executor` question is unreachable by design → the CLI never mints eligibility/qualification/authority and never touches workspace-session model selection.
- Output: canonical client result verbatim as JSON on stdout plus one `verdict` convenience projection of `threshold.action`. Semantic duplication: none.
- Exit codes: `0` valid decision (verdict — INCLUDING HUMAN_GATE — lives in the JSON, not in the process status), `2` invalid invocation/input, `3` transport/runtime failure (timeout/rate-limit/unavailable/missing credential), `4` contract violation (policy failure, answer-space violation, malformed provider response).

## DoD evidence (all five proven in `tests/vnext/jev-frontdoor.test.mjs`, 7 tests)

1. **CLI/API parity** — CLI payload deep-equals a direct `client.ask()` result for identical inputs, with receipt identity (`receipt_id`/`created_at`, minted per invocation by design) stripped on both sides; `verdict === threshold.action`.
2. **Transport neutrality** — `openrouter` vs `zen` runs on the same question/state: receipts deep-equal after provenance strip; only `receipt.mode` differs.
3. **Fail closed** — unknown question (incl. `preferred_executor`), unknown mode, unknown flag, missing/unparsable/oversized state → exit 2 + typed `error_class`; missing credential / 429 → exit 3; answer-space violation / malformed response / broken policy → exit 4. No path implies continue.
4. **No semantic duplication** — `receipt.choices` deep-equals the registry answer space; `receipt.threshold_policy_version` equals the canonical policy file version.
5. **Machine composability** — end-to-end child-process run through the npm script mapping (`package.json` assertion + `spawnSync`): stable JSON, `fixture` demo verdict PROCEED exit 0; HUMAN_GATE fixture (confidence 0.23) → exit 0 with `verdict: "HUMAN_GATE"`; usage/help semantics.

## Gates (Observed)

| Gate | Result |
|---|---|
| `npm run test:vnext` | **248/248 pass** (241 after Slice 1 + 7 new) |
| focused `node --test tests/vnext/jev-frontdoor.test.mjs` | 7/7 pass |
| `npm run validate-maws-vnext` | issues: [] |
| `npm run scan-secrets` | findingCount: 0 |
| `npm run runtime:jev-decide -- --question work_class --mode fixture --case frontdoor-work-class-valid` | exit 0, canonical receipt + `verdict: "PROCEED"` (applied_threshold 0.8, exact `jev-1.13.0` entry) |
| `git diff --check` | clean |

## Not in this slice (binding)

- `next_action` question (JEV-QUESTION-NEXT-ACTION-01) — deliberately deferred until after Zen live-wire activation (owner sequencing).
- Multi-question batching — forbidden here (atomic receipts, OD-19 item 4).
- Any live `zen` call — remains gated on `OPENCODE_API_KEY` + live-wire response observation (owner terminal action); CLI contract-level support only.

## Residuals / next gates

1. **Zen live-wire parity still unproven** (owner Vorbehalt, confirmed): Slice 1 parity is contract/fixture-level; the real `/v1/systemone` response layout has never been observed. The CLI deliberately does not change this posture. Live activation = owner gate.
2. Push/PR/merge, registry amendment (mode enum `zen`), and JEV-QUESTION-NEXT-ACTION-01 remain owner-gated.

## Files changed (this slice, vs `5400d4d`)

- `runtime/cli/runtime-jev-decide.mjs` (new)
- `package.json` (`runtime:jev-decide` script)
- `runtime/decision-engine/jev/fixtures/frontdoor-work-class-valid.json` (new fixture)
- `runtime/decision-engine/jev/fixtures/frontdoor-human-gate.json` (new fixture)
- `tests/vnext/jev-frontdoor.test.mjs` (new)
- `evidence/jev-runtime-frontdoor-01/RUN.md` (this record)
