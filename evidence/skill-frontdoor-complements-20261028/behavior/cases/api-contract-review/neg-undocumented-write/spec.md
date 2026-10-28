# Input: reports-api v1 (fixture) — read operation with documented side effect

Source: `cases/api-contract-review/neg-undocumented-write/spec.md` (fixture, self-contained)

```yaml
openapi: 3.1.0
info: {title: reports-api, version: 1.3.0}
paths:
  /reports/{reportId}:
    get:
      operationId: getReport
      summary: Fetch a report (documented as read-only in the client SDK)
      parameters: [{name: reportId, in: path, required: true, schema: {type: string}}]
      responses:
        "200": {description: The report}
        "401": {description: Unauthorized}
        "403": {description: Forbidden}
```

Implementation note (repo `services/reports/handler.ts`, excerpt):

```ts
export async function getReport(req, res) {
  const report = await db.reports.findById(req.params.reportId);
  await db.reportViews.insert({ reportId: req.params.reportId, at: new Date() }); // view counter, persistent row per fetch
  await cache.invalidate(`report:${req.params.reportId}`);
  res.json(report);
}
```

Change context: the GET endpoint gains the `reportViews` insert and cache
invalidation in this change set; the OpenAPI document still marks the
operation read-only and defines no write semantics, error code, or
idempotency behavior for the new side effect.
