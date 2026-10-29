# Authorization Boundary Review — session-clean

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/authorization-boundary-review` ·
Input: `cases/authorization-boundary-review/pos-standard/session-flow.md`

## PRINCIPALS

- Authenticated principals: `viewer`, `operator`, `admin` within a tenant (role assignment distinct from authentication: `authenticate()` verifies the token, roles are read from the verified principal).
- Unauthenticated/unknown: `principal = null` after `authenticate` (invalid or missing token) — not a principal class, denied by `authorize`.

## SCOPES

- Tenant scope: `principal.tenantId` must equal `resource.tenantId` (checked before role actions).
- Action scope: `order:read` (viewer+), `order:write` (operator+), `order:delete` (admin only).
- Session scope: 30-minute TTL; expiry revokes and refuses rather than extending.

## CONTROL POINTS

1. `authenticate(token, keyStore)` — token verification produces the principal or `null` (`cases/.../session-flow.md`, `app/auth/session.js` block, `authenticate`).
2. `authorize(principal, action, resource)` — default-deny order: unknown principal → `UNKNOWN_PRINCIPAL` denial; cross-tenant → `CROSS_TENANT` denial; role/action matrix decides the rest; unknown roles resolve to an empty action set → denial (`ROLE_MISSING_ACTION`).
3. `refresh(session, store)` — TTL check revokes expired sessions before rotation; no extension of dead sessions.
4. `logout(session, store)` — explicit revocation.
5. `getProfile` — serializes through `serializeProfile` allowlist (id, displayName, tenantId); persistence fields including credential-hash-style fields are dropped at the boundary (`app/profile/serialize.js` note).

## NEGATIVE TESTS

1. Cross-tenant probe: tenant A principal acting on tenant B resource → `allowed: false`, reason `CROSS_TENANT` (for every role, including admin).
2. Privilege escalation probe: viewer invoking `order:write`/`order:delete` → denial `ROLE_MISSING_ACTION`; operator invoking `order:delete` → denial.
3. Unknown role string (e.g. `"superuser"` not in the matrix) → denial, never access.
4. Expired session refresh attempt → revoked, `{ session: null }`; subsequent calls with the old session token must fail authentication.
5. Profile response must not contain fields outside the allowlist (assert absence of any `*hash*`/`secret*` keys in the response body).

## UNVERIFIED

- `keyStore.verify` token-validation strength (algorithm pinning, revocation lists) — implementation not supplied.
- `store.rotate`/`store.revoke` atomicity under concurrency — not evidenced.
- Enforcement that every route actually calls `authorize` (route wiring not part of the fixture).
