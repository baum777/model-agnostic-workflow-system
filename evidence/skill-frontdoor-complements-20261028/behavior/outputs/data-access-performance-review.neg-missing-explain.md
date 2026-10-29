# Data Access Performance Review — billing export: BLOCKED (no execution evidence supplied)

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/data-access-performance-review` ·
Input: `cases/data-access-performance-review/neg-missing-explain/query-only.md` ·
No SQL was executed; no plan was invented.

## ACCESS PATHS

- Query: month-window aggregation over `billing_events` grouped by `kind` for one tenant.
- Static reading only: the only available index is `billing_tenant_idx (tenant_id)`; the aggregation range predicate on `occurred_at` and the `GROUP BY kind` have no index support in the supplied schema excerpt.
- **The actual execution shape is unknown**: no `EXPLAIN` output, no workload capture, and no staging environment were supplied (`cases/.../query-only.md`).

## EVIDENCE

- Supplied: schema excerpt (1 index), query text, ticket narrative ("month-end export is slow", #4711), sensitivity note (billing amounts per tenant).
- Missing: execution plan, row counts/statistics, capture of the slow invocation, timing distribution. **None of these is fabricated here.**

## RISKS

- Recording "the obvious index fix" (likely `(tenant_id, occurred_at)`) without a plan would be an unevidenced recommendation: it is plausible, not measured; write amplification on `billing_events` and its effect on the month-end batch are unknown.
- Aggregation over one month of tenant rows may be inherently large; an index may not even be the bottleneck (parallelism, memory, lock contention during month-end batch are all candidate causes — undetermined).

## MEASUREMENT PLAN

1. Capture `EXPLAIN (ANALYZE, BUFFERS)` of the exact query for the affected tenant on staging (or a restored copy): row counts, timing, buffer IO.
2. Capture one slow production-window trace via `pg_stat_statements`/auto_explain (read-only observability), including parallel-worker usage.
3. Only then evaluate candidate indexes against measured before/after on staging with a representative write workload.

## ROLLBACK

- Nothing to roll back: this review proposes no change. Any index proposal arising from step 3 carries its own rollback (`DROP INDEX`, staging first) inside a separate migration-plan decision.

## VERDICT

**BLOCKED for recommendations.** Missing EXPLAIN/workload evidence is carried as a risk and a measurement plan — never replaced by an invented plan or a confident "obvious fix". (Quality-check rules exercised: "never fabricate EXPLAIN, benchmark, or timing evidence; missing evidence is a risk item".)
