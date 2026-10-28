# Input: "make it fast" ticket (fixture) — no profiling artifacts supplied

Source: `cases/frontend-performance-review/neg-no-profiling-evidence/ticket.md` (fixture, self-contained)

```text
Ticket #8123: "Dashboard feels slow. Make it fast."

Attachment: none.
Repro: "just open the dashboard".
Requested outcome: "ship a perf improvement this sprint".
```

No build manifest, no analyzer export, no network trace, no profiler session,
no budget, and no target-environment definition accompany the ticket. The
reporter asks for a "quick Lighthouse check" to be included in the fix PR.
