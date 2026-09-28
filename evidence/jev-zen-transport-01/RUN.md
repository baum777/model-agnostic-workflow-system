# JEV-ZEN-TRANSPORT-01 — Run Record

- **Date:** 2026-09-28
- **Task class:** shared-core implementation slice (MAWS vNext decision plane)
- **Base SHA:** `19bd2a8` (MAWS main, closure manifest baseline)
- **Branch:** `session/jev-zen-transport-01` (session worktree `runtime/worktrees/maws-jev-zen-01`, isolated from the foreign uncommitted portable-skill migration in the shared checkout; node_modules symlinked read-only)
- **Owner decision basis:** OD-19 (this branch, `docs/maws-vnext-owner-decisions.md`), recorded from the owner chat of 2026-09-28; slice separation per owner spec (transport ≠ question ontology ≠ developer interface).

## Scope (implemented)

1. `runtime/decision-engine/jev/zen-systemone.mjs` — second Jev transport: `POST https://opencode.ai/zen/v1/systemone`, Bearer `OPENCODE_API_KEY` (closure-private), host allowlist `opencode.ai` enforced via `assertOutboundUrlAllowed` BEFORE fetch, https strictly, timeout/abort → `JEV_TIMEOUT`/`JEV_UNAVAILABLE` (ESCALATE), 401→`JEV_UNAUTHORIZED` (BLOCKED), 402→`JEV_PAYMENT_REQUIRED` (BLOCKED), 429→`JEV_RATE_LIMITED` (ESCALATE), malformed body → `JEV_BAD_RESPONSE` (BLOCKED). No endpoint/model fallback, no chat/completions substitution, no secret reflection.
2. `runtime/decision-engine/jev/client.mjs` — `mode: 'zen'` wired alongside `fixture`/`live`/`openrouter` (validation, allowlist default, transport creation, dispatch); request builder mirrors the documented Zen request schema, which is identical to the verified OpenRouter Decisions schema (`{model, state, questions:{id:{type:'choice',instructions,criteria}}}`).
3. `runtime/decision-engine/jev/decision-receipt.mjs` + `core/contracts/decision-receipt.schema.json` — receipt `mode` enum extended with `zen` (provenance only; receipt semantics unchanged, closed field set unchanged).
4. `tests/vnext/zen-systemone.test.mjs` — 11 tests: request-shape parity with the OpenRouter builder (deep-equal wire bodies), normalizer acceptance/damage rejection, normalizer parity (deep-equal candidates modulo snapshot naming), status mapping, missing-key fail-closed pre-fetch, allowlist violation pre-fetch (`URL_HOST_NOT_ALLOWLISTED`), full-client ask() with receipt-shape validation + threshold PROCEED, answer-space enforcement (never coerced), choices-widening denial, 401/429/bad-shape typing, secret-reflection checks.
5. **Transport-parity DoD (owner-specified):** `transport parity (DoD)` test proves that the same canonical question through `openrouter` and `zen` yields DecisionReceipts indistinguishable after stripping provenance fields (`receipt_id`, `created_at`, `mode`) and equal threshold outcomes. Downstream MAWS cannot distinguish the transports except via provenance.

## Not in this slice (binding separation, OD-19 item 5)

- `JEV-RUNTIME-FRONTDOOR-01` — `runtime:jev-decide` session CLI.
- `JEV-QUESTION-NEXT-ACTION-01` — `next_action` registry addition.
- Multi-question batching — deliberately not implemented; decisions stay atomic (one receipt per question).

## Gates (Observed)

| Gate | Baseline `19bd2a8` | After slice |
|---|---|---|
| `npm run test:vnext` | 230/230 pass | **241/241 pass** (11 new) |
| `npm run validate-maws-vnext` | issues: [] | issues: [] |
| `npm run scan-secrets` | — (n/a) | findingCount: 0 |
| focused `node --test tests/vnext/zen-systemone.test.mjs` | — | 11/11 pass |
| `git diff --check` | — | clean (run pre-commit) |

## Residuals / next gates (explicit, not claimed)

1. **Live activation pending owner key:** `OPENCODE_API_KEY` is not provisioned in agent or owner env. The exact Zen RESPONSE field set (resolved snapshot naming, confidence/probabilities/usage placement) is documented nowhere public; this transport normalizes the verified OpenRouter-Decisions-shaped response until first live activation confirms it (same posture as `live` mode). Live parity probe = owner terminal action.
2. **Registry disposition pending (owner gate):** `decision-receipt.schema.json` `mode` enum now includes `zen`. Per precedent (registry PR #96 handled the `decision-receipt.mode` enum class), the unitera-registry record may require an amendment binding this schema state. The registry authority repo was NOT touched in this slice — `REQUIRED_BUT_OWNER_GATED`.
3. **Commit/push:** local commit on `session/jev-zen-transport-01` only; no push, no PR, no merge, no activation (owner gates).
4. Foreign uncommitted portable-skill migration in the shared checkout is untouched; this slice's files are disjoint from it.

## Files changed (this branch vs `19bd2a8`)

- `runtime/decision-engine/jev/zen-systemone.mjs` (new)
- `runtime/decision-engine/jev/client.mjs` (mode wiring + docs)
- `runtime/decision-engine/jev/decision-receipt.mjs` (mode enum + docs)
- `core/contracts/decision-receipt.schema.json` (mode enum)
- `tests/vnext/zen-systemone.test.mjs` (new)
- `docs/maws-vnext-owner-decisions.md` (OD-19 appended)
- `evidence/jev-zen-transport-01/RUN.md` (this record)
