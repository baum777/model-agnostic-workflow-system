# Input: schema + query + supplied plan (fixture)

Source: `cases/data-access-performance-review/pos-standard/schema-query-plan.md` (fixture, self-contained)

```sql
-- schema (excerpt, PostgreSQL 16)
CREATE TABLE orders (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX orders_tenant_created_idx ON orders (tenant_id, created_at DESC);
-- no index on (tenant_id, status)

-- query under review (reported slow for one large tenant)
SELECT id, created_at
FROM orders
WHERE tenant_id = $1 AND status = 'open'
ORDER BY created_at DESC
LIMIT 50;
```

Supplied `EXPLAIN (ANALYZE off)` output (captured from staging, read-only):

```text
Limit  (cost=0.43..3112.97 rows=50 width=24)
  -> Index Scan using orders_tenant_created_idx on orders
       Index Cond: (tenant_id = $1)
       Filter: (status = 'open'::text)
       Rows Removed by Filter: 214803
```

Workload evidence: p95 latency 1.8 s for tenants with >200k orders; read-only
reporting workload, no writes during capture. Sensitivity: order metadata only.
