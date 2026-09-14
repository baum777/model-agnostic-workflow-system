# GENERIC-RUNTIME-OPEN-GAPS.md

Class: freeze artifact (canonical open-gap register at freeze time).
Use rule: every known open point of the generic runtime core is listed here with
exactly one work class. Nothing is hidden: freeze means "no open
CORE_CORRECTNESS / CORE_SAFETY gap", not "no open work". Classes are never mixed.

## Work Classes

```text
CORE_CORRECTNESS        — a core behavior is wrong or missing (none open)
CORE_SAFETY             — an authority/safety boundary is unsound (none open)
ASSURANCE_HARDENING     — defense-in-depth for already-accurate claims
CRASH_DURABILITY        — power-loss / torn-write windows beyond restart safety
OWNER_POLICY            — requires an explicit owner decision
DOMAIN_INTEGRATION      — real adapters / domain semantics outside the generic core
PRODUCTION_OPERATIONS   — operational posture (locking, retention, metering ops)
FUTURE_OPTIMIZATION     — useful later, no correctness or claim impact
```

## Register

| # | Gap | Class | State | Notes |
| --- | --- | --- | --- | --- |
| G-01 | Event hash chain (suffix/whole-stream rewrite detection for chained v2 events) | ASSURANCE_HARDENING | OPEN, design-feasible, BACKWARD_COMPATIBLE (versioned event contract v2, genesis `previous_event_digest: null`, reader `EVENT_CHAIN_TAINTED` on mismatch) | Current claims are accurate without it; chain != signature != authenticity. Whole-stream replacement with a fresh chain stays undetectable without an external anchor. |
| G-02 | Crash durability (fsync file, fsync parent dir after rename, safe append helper, torn-tail policy) | CRASH_DURABILITY | OPEN, windows mapped in POST-P11 recon B7 | Restart safety holds and is the only claim made anywhere; no claim correction required. True power-loss proof is not in-process testable. |
| G-03 | Single-writer lock for artifact appends (events, memory, usage) | PRODUCTION_OPERATIONS | OPEN | House posture is one runtime process per run; no lock implemented. |
| G-04 | SM-GAP-1 | OWNER_POLICY | OWNER_DECISION_REQUIRED | No state-machine semantics may be invented by any implementer. |
| G-05 | SM-GAP-2 | OWNER_POLICY | OWNER_DECISION_REQUIRED | as above |
| G-06 | SM-GAP-3 | OWNER_POLICY | OWNER_DECISION_REQUIRED | as above |
| G-07 | SM-GAP-4 | OWNER_POLICY | OWNER_DECISION_REQUIRED | as above |
| G-08 | F-02 external defect | OWNER_POLICY | READY_FOR_REGISTRATION; write NOT_AUTHORIZED; source_fix NOT_AUTHORIZED | Do not touch. |
| G-09 | Production Context adapter | DOMAIN_INTEGRATION | NOT_AUTHORIZED | Requires conformance PASS + separate production authorization. |
| G-10 | Production Authority adapter | DOMAIN_INTEGRATION | NOT_AUTHORIZED | + authority semantic governance review. |
| G-11 | Production Effect adapter | DOMAIN_INTEGRATION | NOT_AUTHORIZED | + production authorization. |
| G-12 | Unitera CCA-02 context adapter | DOMAIN_INTEGRATION | EXCLUDED from generic core | Explicit owner order required. |
| G-13 | Unitera Authority adapter | DOMAIN_INTEGRATION | NOT_AUTHORIZED | Domain-specific semantics. |
| G-14 | Real usage sources for tokens/cost | DOMAIN_INTEGRATION | EXTERNAL by design | Core refuses invented cost/tokens (EXTERNAL_USAGE_SOURCE); no fake cost model. |
| G-15 | Domain workflow integration | DOMAIN_INTEGRATION | NOT_STARTED | Next phase after freeze. |
| G-16 | Retention, compaction, size-cap tuning | FUTURE_OPTIMIZATION | OPEN | No correctness or claim impact. |

## Non-Gaps (documented so they are not re-raised as gaps)

- `PARTIAL` is never produced by the evidence-chain validator — no policy basis
  exists; PASS/FAIL only (P9 decision, intentional).
- Conformance results carry `trust_level: null` and `authorization: null` by
  construction (P11-A8) — this is a guarantee, not a missing feature.
- INDEPENDENCE_WEAK: event emission and checkpoint writes originate from the
  same in-process transition records. Evaluators prove the two persistence
  tracks agree; they do not prove controller correctness. Known and accepted.
- Dry-run stream contains rolled-back negative-path records and is honestly
  DENIED for state projection (not a monotonic history).
- Timeouts are structurally NOT_APPLICABLE for the synchronous in-process ports;
  no faked async semantics.
