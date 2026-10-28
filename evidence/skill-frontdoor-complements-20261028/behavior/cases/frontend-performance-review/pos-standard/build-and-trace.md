# Input: checkout-spa build + trace (fixture)

Source: `cases/frontend-performance-review/pos-standard/build-and-trace.md` (fixture, self-contained)

```text
# bundle manifest (analyzer export, build 2026-10-27T14:02Z)
entry.app.js        412 kB  [react, react-dom, router, app-shell]
vendor.chart.js     288 kB  [charting-lib@9]          async: loaded by /reports
vendor.chart2.js    291 kB  [charting-lib@7]          async: loaded by /legacy-reports
entry.app.css        34 kB
fonts/*.woff2       3 files, 18 kB total             loaded via CSS @font-face

# network waterfall (captured trace, throttled Fast-3G, cold cache)
1.  GET /                       200  html           180 ms
2.  GET /entry.app.js           200  js    (render-blocking)  640 ms
3.  GET /entry.app.css          200  css   (render-blocking)  210 ms
4.  GET /fonts/Inter-*.woff2    200  font  (waits for CSS)    +90 ms after 3
5.  navigate /reports -> GET /vendor.chart.js   200  js   720 ms (post-click)
6.  navigate /legacy-reports -> GET /vendor.chart2.js 200 js 705 ms (post-click)

# render behavior (React Profiler export, staging session)
- DataTable re-renders 41x during scroll; each render recomputes sortedRows (no memo)
- scroll handler dispatches a store update per scroll event (unbatched)
```

Budgets: none documented. Target environment: mid-range mobile documented in the README.
