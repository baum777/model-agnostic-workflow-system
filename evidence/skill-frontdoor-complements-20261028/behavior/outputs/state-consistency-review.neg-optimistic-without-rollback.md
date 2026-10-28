# State Consistency Review — likes-store: FINDING (optimistic update without recovery path)

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/state-consistency-review` ·
Input: `cases/state-consistency-review/neg-optimistic-without-rollback/likes.md`

## OWNERSHIP MAP

- Server-authoritative (per the documented policy): like counts and `likedByMe`.
- Client state: `likesSlice` holds a **copy** of server data that is never revalidated — it is a cached projection pretending to be a source of truth (`state/likes.ts`).

## MUTATION FLOWS

- `likeButtonClicked`: applies the optimistic increment immediately, takes **no pre-mutation snapshot**, and on server failure merely logs a warning (`cases/.../likes.md`, catch block). The mutation flow has no invalidation path at all — the comment states a page reload is the only reconciliation.

## RECOVERY PATHS

- **FINDING: the optimistic update has no recovery path.** On failure the incremented count and `likedByMe` remain — the UI shows state the server never accepted, indefinitely. The owning policy explicitly permits optimism *and* asserts server authority; this implementation honors neither the rollback nor the reconciliation half. Per the skill's rules this is a defect finding, not a style choice: an optimistic update without a rollback or reconciliation path is a finding. Required remedy: capture the previous state before mutating, restore it on error (and/or revalidate on settle), and reconcile the projection with the server.

## NEGATIVE TESTS

1. Force `api.likePost` to fail → after the warning, the UI must show the pre-click count; currently it shows the optimistic one (fails).
2. Two devices, one like each → after any success path, counts must converge to the server value; no invalidation exists (fails).
3. Toggle like offline then reconnect → final state must equal server state; currently impossible without reload (fails).

## GAPS

- Server-side like semantics (idempotency of repeated like calls) not supplied.
- No failure-mode expectations documented for this flow — the gap list for the owning team, alongside the finding above.
