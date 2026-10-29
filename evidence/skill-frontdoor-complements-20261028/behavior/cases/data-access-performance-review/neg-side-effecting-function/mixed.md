# Input: nightly report (fixture) — read path invokes a side-effecting function

Source: `cases/data-access-performance-review/neg-side-effecting-function/mixed.md` (fixture, self-contained)

```sql
-- schema (excerpt)
CREATE TABLE usage_counters (
  tenant_id uuid PRIMARY KEY,
  report_runs bigint NOT NULL DEFAULT 0
);
CREATE INDEX usage_reported_idx ON usage_events (tenant_id, reported_at DESC);
```

```python
# jobs/nightly_usage_report.py (excerpt)
def build_report(db, tenant_id):
    # "read" report path
    rows = db.sql("""
        SELECT day, sum(bytes)
        FROM usage_events
        WHERE tenant_id = :t AND reported_at >= now() - interval '30 days'
        GROUP BY day ORDER BY day
    """, t=tenant_id)
    db.execute("UPDATE usage_counters SET report_runs = report_runs + 1 WHERE tenant_id = :t", t=tenant_id)
    db.call("prune_usage_events(tenant_id => :t)", t=tenant_id)   # pruning side effect inside the report job
    return rows
```

Supplied EXPLAIN (captured, read-only) for the SELECT: index scan on
`usage_reported_idx`, 412 rows, cost 12.9. No plan exists for the UPDATE or
the `prune_usage_events` call (they are not SELECTs). Workload: nightly batch,
single tenant per run.
