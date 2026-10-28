# Input: claimed audit result (fixture) — narrative numbers without artifacts

Source: `cases/frontend-performance-review/neg-claimed-lighthouse/claim.md` (fixture, self-contained)

```text
PR #914 description: "Dashboard is now fast. Lighthouse run passed with a
performance score of 98; TTI went from 4.1 s to 1.2 s after my change."

Changed files: src/dashboard/Dashboard.tsx (+2/-2, wrapped a list in memo)

Attached artifacts: none — the Lighthouse JSON, the before/after run configs,
and the machine/profile used are not attached; CI does not run Lighthouse.
```

The reviewer is asked to approve the PR on the strength of the narrative numbers.
