# Input: billing export (fixture) — no execution plan supplied

Source: `cases/data-access-performance-review/neg-missing-explain/query-only.md` (fixture, self-contained)

```sql
-- schema (excerpt)
CREATE TABLE billing_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  kind text NOT NULL,
  amount numeric NOT NULL,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX billing_tenant_idx ON billing_events (tenant_id);

-- query under review ("month-end export is slow", ticket #4711)
SELECT kind, sum(amount) AS total
FROM billing_events
WHERE tenant_id = $1
  AND occurred_at >= date_trunc('month', now()) - interval '1 month'
  AND occurred_at < date_trunc('month', now())
GROUP BY kind
ORDER BY total DESC;
```

No EXPLAIN output, no workload capture, and no staging environment are
attached to the ticket; the reporter asks for "the obvious index fix".
Sensitivity: billing amounts per tenant.
