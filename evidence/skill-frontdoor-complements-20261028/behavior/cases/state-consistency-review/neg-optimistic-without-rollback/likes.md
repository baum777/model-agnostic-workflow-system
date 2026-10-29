# Input: likes-store (fixture) — optimistic update without recovery

Source: `cases/state-consistency-review/neg-optimistic-without-rollback/likes.md` (fixture, self-contained)

```ts
// state/likes.ts — owning policy (documented): "server is authoritative for
// like counts; the UI may optimistically reflect the user's own action"
export const likesSlice = {
  count: 0,
  likedByMe: false,
};

export async function likeButtonClicked(postId: string) {
  // optimistic: apply immediately, no snapshot taken
  likesSlice.count += 1;
  likesSlice.likedByMe = true;
  render();
  try {
    await api.likePost(postId);
  } catch (err) {
    console.warn("like failed", err);
    // no rollback: count and likedByMe stay incremented
  }
}

// no invalidation path exists: likesSlice is never reconciled with the server;
// a page reload is the only way the count returns to the authoritative value
```

Failure-mode expectations: none documented for this flow.
