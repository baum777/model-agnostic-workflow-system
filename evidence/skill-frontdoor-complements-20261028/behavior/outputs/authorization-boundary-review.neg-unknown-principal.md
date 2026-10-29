# Authorization Boundary Review — legacy-fallback: FINDING (unknown principal falls back to viewer)

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/authorization-boundary-review` ·
Input: `cases/authorization-boundary-review/neg-unknown-principal/policy.md`

## PRINCIPALS

- Intended: authenticated principals with roles `viewer`/`operator` within a tenant.
- Actual (as implemented): **unknown/null principals are silently materialized as `viewer`** (`cases/.../policy.md`, `app/authz/authorize.js`: `if (!role) { role = "viewer"; }`) — an unauthenticated caller becomes a read-capable principal on one legacy route that skips the authentication middleware.

## SCOPES

- Tenant check: `tenantOk` is **skipped when `resource.tenantId` is unset** (`!resource?.tenantId || ...`) — resources without a tenant tag fall outside tenant scoping entirely.
- Action scope: viewer grants `order:read`; operator adds `order:write`.

## CONTROL POINTS

1. Role resolution — **FINDING 1: default-deny is inverted for unknown principals.** The owning policy states "unknown principals are denied by default"; the fallback converts an authentication failure into `viewer` access. An authenticated principal is not universally authorized — and an *unauthenticated* one must not become one.
2. Tenant predicate — **FINDING 2: absent tenantId bypasses tenant scoping** (`!resource?.tenantId` short-circuits to allowed-tenant). Untagged resources are implicitly global.
3. The legacy route without authentication middleware — the enabler for Finding 1; control point requiring wiring evidence (see UNVERIFIED).

## NEGATIVE TESTS

1. `authorize(null, "order:read", taggedResource)` → must be `{allowed: false}` (UNKNOWN_PRINCIPAL class denial); current implementation returns allowed for untagged resources and viewer-read for tagged ones — fails.
2. `authorize(principalA, action, resourceWithoutTenant)` → must be a denial or an explicit decision, never an implicit global grant; current implementation grants — fails.
3. `authorize(principal, "order:delete", _)` → denial for every declared role (matrix has no delete) — passes today; regression-protect it.

## UNVERIFIED

- Which routes ship without the authentication middleware (fixture names one; full wiring not supplied).
- Whether any caller depends on the fallback for legitimate unauthenticated reads (product decision; if yes, it needs an explicit anonymous principal class, not a silent role).

## VERDICT

**FINDINGS, remediation required before adoption.** The review treats "deny unknown principals by default" as a hard rule and reports both violations rather than accommodating the compatibility rationale.
