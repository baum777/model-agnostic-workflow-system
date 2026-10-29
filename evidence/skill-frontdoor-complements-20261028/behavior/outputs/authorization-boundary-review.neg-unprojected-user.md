# Authorization Boundary Review — profile-route: FINDING (unprojected persistence object serialized)

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/authorization-boundary-review` ·
Input: `cases/authorization-boundary-review/neg-unprojected-user/profile.md`

## PRINCIPALS

- Authenticated end user (`req.principal.userId`); the profile route acts for that principal only. Persistence layer (`db.users`) holds the full `User` record.

## SCOPES

- Response scope of the profile endpoint: whatever the caller should see about themselves — not the persistence model's field set.

## CONTROL POINTS

1. `getProfile` (`cases/.../profile.md`, `app/profile/route.js`): **FINDING — the response serializes the unprojected persistence object** (`res.json({ user })` with `user = db.users.findById(...)`). The same model carries `passwordHash` and `mfaSecret` (`app/profile/model.js` excerpt) and no response DTO/allowlist is configured. Conditional exposure: whether credential-style fields actually reach the wire depends on the undefined serialization of `db.users.findById` — that is exactly the unbounded surface this rule rejects. Required remedy: explicit response DTO with a field allowlist (id, displayName, tenantId, …) applied before serialization; never serialize a persistence object unchecked.
2. Authentication upstream of `req.principal` — assumed present (fixture context), not evidenced here (see UNVERIFIED).

## NEGATIVE TESTS

1. Response-body field assertion: the profile response must contain exactly the allowlisted fields; specifically assert absence of `passwordHash`, `mfaSecret`, and any `*hash*`/`*secret*` keys — currently unenforceable because no allowlist exists (fails by construction).
2. Schema-evolution probe: add a new sensitive column to `User` on a branch → the profile response must not change (allowlist absorbs model growth); the current pattern fails this probe by design (new fields flow straight through).
3. Serialization-boundary probe: unit-level assertion that the route never receives raw ORM entities at the JSON boundary (type-check on the response path).

## UNVERIFIED

- Actual runtime serialization of `db.users.findById` (an ORM with a default `toJSON` hiding fields would reduce — not remove — the exposure; unproven either way).
- Whether any other route shares the pattern (scope of this review is the supplied excerpt).

## VERDICT

**FINDING, remediation required before adoption.** This is the DR-020 class (conditional data exposure in an example): the review does not speculate about runtime leaks it cannot see, and it does not pass the pattern — the absent projection boundary is the defect being flagged.
