# Input: cart-state (fixture) — ambiguous ownership, two writers, no invalidation

Source: `cases/state-consistency-review/neg-ambiguous-ownership/cart.md` (fixture, self-contained)

```ts
// state/cart.ts — no owning policy documented anywhere for cart contents
export const cartStore = { items: [] as Item[] };

// writer 1: product page "Add to cart" button
export async function addToCart(item: Item) {
  cartStore.items.push(item);
  render();
}

// writer 2: server-driven mini-cart websocket pushes (authoritative source unclear)
ws.on("cart_update", (serverItems: Item[]) => {
  cartStore.items = serverItems;
  render();
});

// writer 3: legacy coupon panel mutates the same array for "free gift" items
export function applyCoupon(code: string) {
  cartStore.items.push(FREE_GIFT_ITEM);
  render();
}
```

Notes: no staleness window defined for the websocket push; the coupon panel and
the websocket can interleave (a server push overwrites the not-yet-synced free
gift); no reconciliation or versioning exists. The team is unsure whether the
server or the client owns the cart during an active session.
