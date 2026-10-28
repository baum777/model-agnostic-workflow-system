# State Consistency Review — tasks-store

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/state-consistency-review` ·
Input: `cases/state-consistency-review/pos-standard/store.md`

## OWNERSHIP MAP

- Server-authoritative: task records (`tasksQuery` cache of `api.listTasks`, `state/store.ts`) — owning policy states the server is authoritative; cache carries `staleTime: 30_000` and is invalidated on mutation settle.
- Client-owned: UI selection state (`uiSlice.selectedTaskId`, `filter`) — genuinely UI-only, no server mirror.
- Cached projection: the tasks cache is a projection, revalidated via `invalidate()` on settle and cleared on logout (`queryCache.clear()`), so projections do not outlive the session.

## MUTATION FLOWS

- `toggleTask`: optimistic local update on `onMutate` with in-flight cancellation (`tasksQuery.cancel()`), error rollback to the captured `previous` snapshot, and unconditional `onSettled` invalidation reconciling with the server either way (`cases/.../store.md`, mutation block).
- Logout: session cleared together with all cached projections — no orphaned server data.

## RECOVERY PATHS

- Optimistic update **with** recovery: rollback restores the pre-mutation snapshot on error and surfaces it to the user (toast), then invalidation re-syncs; success path reconciles through the same invalidation. Both branches end server-consistent.
- Documented failure modes: offline queue-and-replay and last-write-wins reconciliation are stated expectations; their implementations are outside the supplied excerpt (see GAPS).

## NEGATIVE TESTS

1. Force `api.toggleTask` failure mid-optimistic update → UI must show the previous state exactly (byte-for-byte rows), not the optimistic one.
2. Conflict: two clients toggle the same task; after settle+invalidation both must converge to the server value.
3. Logout with optimistic update in flight → after replay/error, no task data may remain in the cache.
4. Stale window: read after `staleTime` expiry during a mutation → final render must reflect server state, never a permanently optimistic one.

## GAPS

- Offline queue/replay and last-write-wins logic are policy statements; their code was not supplied and is unverified here.
- `api.listTasks`/`api.toggleTask` failure semantics (retries, idempotency of toggle) not evidenced.
