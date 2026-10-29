# Input: tasks-store (fixture)

Source: `cases/state-consistency-review/pos-standard/store.md` (fixture, self-contained)

```ts
// state/store.ts — owning policy: "server is authoritative for task data;
// client state is UI-only; cached projections must revalidate before use"
export type Task = { id: string; title: string; done: boolean; updatedAt: string };

// server-authoritative slice (query cache with invalidation)
export const tasksQuery = queryKey(["tasks"], () => api.listTasks(), {
  staleTime: 30_000,
});

// client-owned slice (UI only)
export const uiSlice = {
  selectedTaskId: null as string | null,
  filter: "all" as "all" | "open" | "done",
};

// mutation with optimistic update AND rollback
export const toggleTask = mutation({
  mutationFn: (id: string) => api.toggleTask(id),
  onMutate: async (id) => {
    await tasksQuery.cancel();
    const previous = tasksQuery.get();
    tasksQuery.setLocal((rows) => rows.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    return { previous };
  },
  onError: (_err, _id, ctx) => {
    tasksQuery.setLocal(() => ctx.previous); // rollback to pre-optimistic snapshot
    toast.error("Could not update task — restored previous state");
  },
  onSettled: () => tasksQuery.invalidate(), // reconcile with server either way
});

// logout clears session and all cached projections of server data
export function onLogout(session) {
  session.clear();
  queryCache.clear();
}
```

Failure-mode expectations (documented): offline mutations queue and replay;
concurrent edits resolve last-write-wins on the server and reconcile on
`onSettled` invalidation.
