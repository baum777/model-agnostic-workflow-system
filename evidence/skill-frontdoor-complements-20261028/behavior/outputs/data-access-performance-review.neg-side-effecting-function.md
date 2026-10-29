# Data Access Performance Review — nightly report: FINDING (side-effecting calls inside the report path)

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/data-access-performance-review` ·
Input: `cases/data-access-performance-review/neg-side-effecting-function/mixed.md` ·
No SQL executed; analysis over the supplied snapshot.

## ACCESS PATHS

- Read path: 30-day per-day aggregation over `usage_events` using `usage_reported_idx (tenant_id, reported_at DESC)` — supplied plan: index scan, 412 rows, cost 12.9 (healthy; no action).
- **Write/side-effect paths inside the same job step, separated per rule:**
  - `UPDATE usage_counters SET report_runs = report_runs + 1` (row update per run),
  - `db.call("prune_usage_events(tenant_id => :t)")` (destructive pruning inside the "report" job).
- These are **not** read-only queries and are tracked separately in every statement below; no plan exists for them by construction (they are not SELECTs), and none is invented.

## EVIDENCE

- Supplied: schema (2 tables, 1 index), job excerpt, one captured read-only EXPLAIN for the SELECT, workload note (nightly batch, one tenant per run).
- Not supplied: row counts for `usage_counters`/`usage_events` growth, duration of `prune_usage_events`, lock behavior of the UPDATE.

## RISKS

- Functional-risk classification: a job named and reviewed as a "report" performs persistent mutation (counter) and destruction (pruning). Performance analysis of the read path alone would misrepresent the job's cost and blast radius — the pruning call is plausibly the dominant and only irreversible cost, and it is invisible in the supplied read-path evidence.
- Concurrency: counter UPDATE on the tenant's row serializes concurrent report runs (row lock) — low at nightly cadence, but coupling it to reporting makes ad-hoc re-runes contend.
- Rollback asymmetry: the read path is trivially re-runnable; the prune call is not (data removal).

## MEASUREMENT PLAN

1. Time the job in three segments (SELECT / UPDATE / prune) via staging instrumentation before any tuning — the supplied 412-row plan suggests the SELECT is not the problem.
2. If pruning dominates: measure `prune_usage_events` in isolation on a restored copy, including index bloat effects of the deletion pattern.

## ROLLBACK

- Read path: none needed. Counter UPDATE: reversible by subtraction on staging; on production it is an accepted mutation only after explicit ownership.
- Prune call: irreversible by nature — belongs behind its own gated maintenance step with its own backup/rollback plan, not inside a report job. Proposal (for the owning team): split the job into report (read-only) + maintenance (explicit, auditable) steps; that split decision is outside this review's mutation boundary.

## VERDICT

**FINDING (separation + blast radius).** The review keeps read-only queries and side-effecting functions visibly separate, prices the hidden prune cost as the actual risk, and proposes no production mutation.
