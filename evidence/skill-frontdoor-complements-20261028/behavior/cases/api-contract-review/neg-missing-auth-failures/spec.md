# Input: invoices-api (fixture) — no auth/tenant failure cases defined

Source: `cases/api-contract-review/neg-missing-auth-failures/spec.md` (fixture, self-contained)

```yaml
openapi: 3.1.0
info: {title: invoices-api, version: 1.0.0}
paths:
  /invoices:
    get:
      operationId: listInvoices
      responses:
        "200": {description: All invoices visible to the caller}
    post:
      operationId: createInvoice
      requestBody: {content: {application/json: {schema: {$ref: "#/components/schemas/Invoice"}}}}
      responses:
        "201": {description: Created}
components:
  schemas:
    Invoice:
      type: object
      required: [amount]
      properties:
        amount: {type: number}
```

Notes: no security scheme, no 401/403/429 responses, no tenant identifier in
paths or schemas, no pagination, no idempotency key. The team states the
gateway "handles auth before the service".
