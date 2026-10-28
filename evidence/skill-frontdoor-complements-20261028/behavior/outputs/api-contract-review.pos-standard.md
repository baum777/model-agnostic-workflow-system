# API Contract Review — orders-api v2

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/api-contract-review` ·
Input: `cases/api-contract-review/pos-standard/openapi-fragment.md`

## BOUNDARY

- Service: orders-api v2.0.0 (`/v2`), single specification surface reviewed.
- Consumers: calling tenant clients (per-operation tenant scoping declared via `Forbidden` responses on `listOrders`, `createOrder`, `deleteOrder`).
- Side effects: `createOrder` (creates an order; idempotency via `idempotencyKey` + `409` duplicate semantics), `deleteOrder` (destroys the order resource). `listOrders` is side-effect free.
- Auth boundary: `Unauthorized` (401) vs `Forbidden` (403) distinguished on all tenant-facing operations; `deleteOrder` defines 401 but no 403 — see GAPS.

## OPERATIONS

- `listOrders` (GET /orders): cursor pagination (`limit` default 50, max 200; `cursor`), responses 200/401/403/429. Schema `OrderPage` with `nextCursor`.
- `createOrder` (POST /orders): request `OrderCreate` (`items` required, optional `idempotencyKey`), responses 201/409/401/403/429. Retry behavior: `409` on duplicate idempotency key; client may retry safely on 429 per `RateLimited` description.
- `deleteOrder` (DELETE /orders/{orderId}): responses 204/404/401.

## COMPATIBILITY

- Breaking (v1 → v2): operationId rename `orders.list` → `listOrders` breaks clients bound to the v1 identifier (code-generated SDKs, telemetry keys).
- Breaking (v1 → v2): `DELETE /orders/{orderId}` newly tenant-scoped — callers previously deleting cross-tenant will now receive 403; this is an intended authorization tightening and must appear in release notes as a behavior break.
- Server base path moves to `/v2` — v1 retirement plan not part of this specification: see GAPS.

## NEGATIVE TESTS

1. Tenant A token calling `listOrders`/`createOrder`/`deleteOrder` for tenant B resource → expect 403, never 200/201/204.
2. Missing/expired credentials on each operation → expect 401 with no resource data in the body.
3. `createOrder` replayed with the same `idempotencyKey` → expect exactly one created order; second call 409.
4. `listOrders` with `limit=201` → expect rejection (400 or clamp, currently unspecified — see GAPS).
5. Malformed `OrderCreate` (missing `items`) → expect 4xx, never a created order.

## GAPS

- `deleteOrder` lacks 403 in its responses although deletion is tenant-sensitive (specification omission vs `listOrders`/`createOrder`).
- No 400 response defined for invalid input on `createOrder`; no 429 on `deleteOrder`.
- Pagination `limit` upper-bound violation behavior undefined (reject vs clamp).
- v1 → v2 migration/retirement window and parallel-run contract not specified.
- Not verified: runtime conformance of the deployed service to this document (no validation run was executed in this review — none is claimed).
