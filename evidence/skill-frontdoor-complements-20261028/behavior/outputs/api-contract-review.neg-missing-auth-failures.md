# API Contract Review — invoices-api: BLOCKED (missing tenant/auth failure cases)

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/api-contract-review` ·
Input: `cases/api-contract-review/neg-missing-auth-failures/spec.md`

## BOUNDARY

- Service: invoices-api 1.0.0. Declared consumers: any caller of `listInvoices`/`createInvoice`.
- **Boundary is unspecified**: no security scheme, no tenant identifier anywhere in paths/schemas; "the gateway handles auth" is narrative, not contract. The boundary between tenants cannot be derived from this specification.

## OPERATIONS

- `listInvoices` (GET /invoices): single 200 response; response schema undefined ("All invoices visible to the caller" — visibility rules absent).
- `createInvoice` (POST /invoices): 201 only; `Invoice` schema (`amount` required) serves as both request and referenced response model.

## COMPATIBILITY

- Not assessable: there is no prior version and no consumer contract to compare; every future hardening (adding 401/403/429, tenant scoping, pagination) will be a breaking change for clients written against this permissive shape.

## NEGATIVE TESTS

1. Unauthenticated call to each operation → the contract does not define the outcome; a negative test can only assert "must NOT succeed silently" — the response class is undefined (see GAPS).
2. Tenant A credentials listing tenant B invoices → must be impossible by construction; the specification provides no tenant dimension to assert against.
3. Invalid `amount` (missing/negative/non-numeric) → undefined behavior.

## GAPS

- Missing per operation: 401, 403, 429, 400 response definitions; security scheme; tenant scoping; pagination; idempotency for the POST.
- "Gateway handles auth" is an unverified narrative claim — gateway behavior is outside this document and not evidenced here; the service-level contract must still define its auth failure surfaces.
- No OpenAPI or schema validation run was executed in this review; none is claimed.

## VERDICT

**BLOCKED.** Missing tenant/auth failure cases are recorded as gaps, never as covered: the consumer boundary cannot be reviewed into existence. The specification must define scheme, tenant dimension, and auth failure responses before a contract review can pass beyond BOUNDARY. (Quality-check rules exercised: "flag missing tenant or auth failure cases as gaps, never as passes".)
