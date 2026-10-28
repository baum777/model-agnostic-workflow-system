# Frontend Performance Review — checkout-spa

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/frontend-performance-review` ·
Input: `cases/frontend-performance-review/pos-standard/build-and-trace.md` ·
No profiling run was executed in this review; analysis is over the supplied artifacts only.

## WATERFALLS AND BUNDLES

- Entry chain (cold cache, Fast-3G): HTML 180 ms → render-blocking `entry.app.js` 640 ms and `entry.app.css` 210 ms; fonts wait for CSS (+90 ms). The critical path is script-dominated (`build-and-trace.md`, waterfall rows 1–4).
- **Duplicate dependency:** `charting-lib` ships twice — v9 (288 kB, `/reports`) and v7 (291 kB, `/legacy-reports`) — 579 kB total for one library family across two async chunks (bundle manifest).
- Post-click async loads (~710–720 ms each) are sequential per route, not prefetched; nothing indicates preloading of the likely-next route.

## CACHE SCOPE

- All JS/CSS/font assets are contentless in the supplied evidence (no hashes visible in the manifest excerpt) — whether they are immutably cacheable cannot be concluded from the artifacts; recorded as unknown rather than assumed (see GAPS).
- No service worker, CDN, or cache-header configuration is part of the supplied evidence.

## RENDER AND STATE BEHAVIOR

- Measured (profiler export): `DataTable` re-renders 41× during scroll with `sortedRows` recomputed each render (no memoization).
- Measured: scroll handler dispatches a store update per scroll event — unbatched updates; inferred hypothesis (not measured): batching or rAF-collapsing the handler would cut dispatch count; requires a profile to confirm.

## MEASUREMENT PLAN

1. Re-run the Fast-3G trace with cache headers recorded, before/after any change, on the documented mid-range mobile profile.
2. Bundle analyzer comparison after consolidating `charting-lib` to one major version (measure both route bundles).
3. React Profiler run with and without `sortedRows` memoization and a batched scroll handler; commit counts before/after.
4. Define budgets (TTI, JS transferred per route) — currently absent — and measure against them.

## GAPS

- Cacheability of assets unknown (no hash/header evidence supplied).
- No Lighthouse or lab run was executed here; no performance score is claimed.
- Budgets undefined; "feels slow" thresholds cannot be evaluated until defined.
- Legacy-reports route traffic share unknown — consolidation priority depends on it.
