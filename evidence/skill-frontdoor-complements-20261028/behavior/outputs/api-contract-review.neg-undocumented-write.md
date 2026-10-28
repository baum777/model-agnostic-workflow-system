# API Contract Review — reports-api: REJECTED (undocumented write in a read operation)

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/api-contract-review` ·
Input: `cases/api-contract-review/neg-undocumented-write/spec.md`

## BOUNDARY

- Service: reports-api v1.3.0. Declared consumers: read-only `getReport` (documented read-only in the client SDK).
- **Boundary violation:** the change set introduces persistent writes (a `reportViews` insert per fetch and a cache invalidation) inside a GET operation whose contract declares no write semantics (`cases/.../spec.md`, `services/reports/handler.ts` excerpt).

## OPERATIONS

- `getReport` (GET /reports/{reportId}): spec responses 200/401/403; implementation additionally performs `db.reportViews.insert(...)` and `cache.invalidate(...)` — side effects with **no contract representation**: no write semantics, no failure modes (what happens to the 200 response if the insert fails?), no idempotency statement for repeated fetches.

## COMPATIBILITY

- SDK clients treat this operation as safe-to-retry and cacheable (read-only GET semantics); per-fetch persistent rows break that assumption silently. Retries, prefetchers, and monitors will multiply `reportViews` rows — an undocumented behavioral break for every consumer relying on GET safety.

## NEGATIVE TESTS

1. Fetch `getReport` twice with the same credentials → assert whether `reportViews` gains two rows; under the declared contract it must gain none (read operation).
2. Force `reportViews` insert failure (constraint/constraint-mock on staging) → assert the operation's observable contract (does it 500 on a "read"?).
3. Client-sdk retry storm simulation → assert `reportViews` growth is bounded or absent.

## GAPS

- If view counting is a product requirement, it needs its own contract surface (explicit write endpoint, or documented side-effect semantics with failure and idempotency behavior) — a product decision outside this review.

## VERDICT

**REJECTED as specified.** An undocumented write inside a declared read operation is not normalized away by this review: either remove the side effects from the GET path or make them first-class contract behavior before merge. (Quality-check rule exercised: "reject undocumented writes in read operations instead of normalizing them away".)
