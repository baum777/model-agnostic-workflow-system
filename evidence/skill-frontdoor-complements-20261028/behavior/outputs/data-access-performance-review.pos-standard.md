# Data Access Performance Review — orders listing query

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/data-access-performance-review` ·
Input: `cases/data-access-performance-review/pos-standard/schema-query-plan.md` ·
No SQL was executed; analysis is over the supplied snapshot only.

## ACCESS PATHS

- Query: `SELECT id, created_at FROM orders WHERE tenant_id = $1 AND status = 'open' ORDER BY created_at DESC LIMIT 50`.
- Available index matching the predicate prefix: `orders_tenant_created_idx (tenant_id, created_at DESC)` — supports tenant equality and the ordering.
- No index carries `status`; the plan confirms `status = 'open'` runs as a filter **after** the index scan (`cases/.../schema-query-plan.md`, EXPLAIN block).

## EVIDENCE

- Supplied plan (staging, `EXPLAIN (ANALYZE off)`): Index Scan using `orders_tenant_created_idx`, `Filter: (status = 'open')`, `Rows Removed by Filter: 214803`.
- Workload: p95 1.8 s for tenants > 200k orders; read-only reporting workload; sensitivity: order metadata only.
- Evidence basis is exactly the supplied snapshot; nothing below extrapolates beyond it.

## RISKS

- Primary risk: reading up to ~214.8k filtered-out rows per invocation for open-order-sparse tenants (scan amplification proportional to tenant size). The LIMIT 50 truncates output, not scanning.
- Lock/isolation risk: low — plain SELECT under MVCC, no locking clauses present in the snapshot.
- Index-addition risk: a `(tenant_id, status, created_at DESC)` index would trade write amplification on `orders` (hot table) for read relief; effect size is not measurable from the supplied evidence.

## MEASUREMENT PLAN

1. Capture `EXPLAIN (ANALYZE, BUFFERS)` for the query on a staging copy for the three largest tenants (before/after any change) — timing and buffer counts, not wall-clock anecdotes.
2. Measure `pg_stat_user_indexes.idx_scan` / write-latency deltas on `orders` for a representative write workload before/after adding any index.
3. Re-run the p95 probe from the same workload harness used for the 1.8 s figure.

## ROLLBACK

- The only proposed mutation so far is a candidate index; rollback = `DROP INDEX` (non-destructive, metadata-only) on staging first.
- No data migration is proposed; no production system is touched by this review. Any change promotion requires a separate migration-plan decision (`core/skills/migration-planner` boundary).
