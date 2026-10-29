# State Consistency Review — cart-state: FINDING (ambiguous ownership, three writers, no reconciliation)

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/state-consistency-review` ·
Input: `cases/state-consistency-review/neg-ambiguous-ownership/cart.md`

## OWNERSHIP MAP

- **FINDING 1: ownership of cart contents is undefined, and the skill does not resolve ambiguity by inventing an owner.** Three writers mutate the same array with no declared authority: a user action (`addToCart`), a server websocket push (`cart_update`), and a local coupon side effect (`applyCoupon`) — all in `state/cart.ts`. No owning policy is documented anywhere for cart contents (`cases/.../cart.md`, Notes). Per the skill's rules the default posture is *server as authority when ownership is ambiguous* — recorded here as the working assumption with the ambiguity explicit, not as a settled fact.

## MUTATION FLOWS

- `addToTask`-class user write: local `push` + render; no sync to the server is visible in the excerpt.
- Server push: full replacement (`cartStore.items = serverItems`) — **FINDING 2: replacement can silently discard unsynced local writes** (e.g., the free-gift item added by `applyCoupon` is overwritten by the next push; interleaving is acknowledged in the notes).
- Coupon write: local `push` with no versioning, no queue, no replay.

## RECOVERY PATHS

- None exist: no snapshot, no rollback, no reconciliation, no staleness window for the websocket. Any drift between the three writers persists until one of them overwrites the others.

## NEGATIVE TESTS

1. Add item via `addToCart`, then trigger `cart_update` before any sync → the locally added item must survive or be explicitly reconciled; current code drops it (fails).
2. Apply coupon and receive a push in the same tick → free-gift item must not vanish; current code has no ordering guarantee (fails).
3. Disconnect the websocket mid-session, mutate locally, reconnect → state must converge to a defined authority; no convergence mechanism exists (fails).

## GAPS

- Whether the server knows about coupon free-gifts at all is not evidenced — determines whether the correct model is server-authoritative-with-append or a two-source merge.
- Websocket delivery semantics (ordering, at-least-once?) not supplied; replay/dedup design depends on it.
- Ownership decision is the owning team's to make and document; this review records the ambiguity and its consequences, and defaults to server authority pending that decision.
