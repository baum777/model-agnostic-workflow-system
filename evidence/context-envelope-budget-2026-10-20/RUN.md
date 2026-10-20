# RUN — context envelope budget (S3 wave A)

Run: OWNER-DIRECTED-CONSOLIDATION-RUN-2026-10-19 — step S3, wave A.
Scope source: `.consolidation-run-20261019/S3-SCOPE.md` (project side).
Worktree: `.worktrees/s3-context-budget-20261020` off origin/main `29fafcbe`.
Implementation commit: `acd8182a5812cb95bdb54a1bfb11d161d2965665`.

## Change

Context budgeting in the actual execution path (`runtime:run`), consolidating
MAWS's own declared vocabulary instead of adding new concepts:

1. **New canonical contract** `core/contracts/context-envelope.schema.json`
   (CONTRACT_RECORD class): `envelope_id` (^ctx_…), `token_budget`
   (integer ≥ 1), optional description. Minimal by design — no deferred
   budget-engine semantics (resource-governor stays a declaration).
2. **Fail-closed numeric enforcement** in the runner, before anything
   executes: (a) deterministic context estimate
   (`estimateTokens(objective) + estimateTokens(boundedPayload)`,
   JSON bytes / 4 — a recorded fixture-lane heuristic, not a tokenizer)
   must fit `token_budget`; (b) the declared executor `tokens_in` must fit
   alongside the context estimate — an envelope its own declarations exceed
   is under-dimensioned. Both fail closed with
   `SPEC_CONTEXT_BUDGET_EXCEEDED` (exit-2 class); no silent truncation.
3. **Declared events made real**: the observability spine's
   `resource.budget_check` (budget scope run, limit, used, unit tokens,
   verdict) is emitted via the event sink before execution — previously the
   spine declared these event types but no runtime code ever emitted them.
4. **Evidence**: `context-envelope.json` in the run bundle — declaration,
   context estimate, declared executor tokens, per-executor reported token
   usage and verdict (`WITHIN_BUDGET` / `EXCEEDED_AT_RUNTIME`).
5. The work unit's `context_envelope_ref` now points at the declared
   envelope; the previously synthetic, never-resolved `ctx/<runId>/envelope`
   dead reference is superseded. Engine unchanged (CLI-layer enforcement,
   same pattern as S2b).

## Safety posture (deliberate)

No live token metering is claimed — declared fixture metrics only; live
metering belongs to the live lane. No change to eligibility semantics
(`budget_compatible` booleans stay as-is, now complemented by the numeric
envelope). No engine change, no transport change.

## Verification

- `node --test tests/vnext/runtime-run-context-budget.test.mjs` — **5/5**
  (happy path with event + artifact and verdict; payload-estimate over
  budget; declared executor tokens over budget; missing envelope;
  schema-invalid envelope).
- `npm run test:vnext` — **283/283**.
- `npm run validate` / `npm run validate-maws-vnext` — PASS.
- Registry disposition: `registry-disposition.json` in this directory —
  CONTRACT_RECORD class, REQUIRED_BUT_BLOCKED (new canonical contract);
  closes via the registry projection after owner merge, same chain as S2b
  wave 1.

## Not claimed

- No live executor metering, no cross-run/global budget scope (spine
  vocabulary supports it; run scope only in wave A), no resource-governor
  `workflowBudgetCap` activation (stays declaration), no Systems change, no
  autonomy/tier enforcement (S3 wave B/C).
