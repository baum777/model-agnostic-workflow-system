# GENERIC-RUNTIME-CHANGE-POLICY.md

Class: freeze artifact (canonical change policy for the frozen generic runtime core).
Use rule: after GENERIC-RUNTIME-BASELINE.md (FROZEN_BASELINE, 2026-09-14), every
change to the generic runtime core surface follows this policy. The policy gates
transitions between states; it never grants authority by itself.

## Freeze Invariants (always enforced)

```text
No new generic runtime capability without explicit architecture disposition.
No contract change without compatibility analysis.
No new artifact class without owner + version + validator.
No adapter activation without conformance run.
No StateMachine change without SM owner disposition.
```

## Change Gates

| Change | Required gate | Notes |
| --- | --- | --- |
| Contract change (core/contracts/clg-*.json or runtime/contracts) | compatibility review + version bump decision | historical streams/records must stay readable; no silent migration, no silent reinterpretation |
| State-machine change (states, transitions, vocabulary) | SM owner disposition | SM-GAP-1..4 stay OWNER_DECISION_REQUIRED; implementers never invent SM semantics |
| Persistent artifact change (event, checkpoint, usage, memory records) | version bump + migration analysis | optional-on-read pattern is the house compatibility mechanism; unknown versions DENY |
| New port | new conformance suite before any activation | harness drives actual runtime gates; no self-attestation |
| Adapter activation | conformance PASS + separate production authorization | CONFORMANCE != TRUST != PRODUCTION_AUTHORIZATION != DEPLOYMENT_APPROVAL |
| Authority semantic change | separate governance review | authority semantics are never changed by implementation convenience |
| New capability in the frozen core | explicit architecture disposition | feature work is not the default; hardening and domain integration are |
| Hash chain introduction (G-01) | design per POST-P11 recon B4/B5; backward-compatible v2 only; no migration without explicit owner authorization | chain != signature != authenticity; no whole-stream authenticity claims |
| Crash durability work (G-02) | concrete failure-window evidence; no storage rearchitecture | only restart-safe claims until fsync-backed proof exists |

## Claim Discipline

- Separate at all times: implemented, tested, self-checked, independently
  reviewed, approved, committed, pushed, merged, adopted, activated, deployed,
  verified in runtime.
- Durability vocabulary: "persisted across normal process restart" until
  fsync-backed durability is implemented and proven. Avoid the bare word
  "durable" in new claims.
- Security-relevant scanner outcomes (e.g., Mimosa compat-pass findings) are
  never treated as security certification or as a security claim.
- Evaluators (evidence chain, state consistency, conformance) stay read-only;
  no automatic state repair; no canonical memory auto-promotion.

## Unfreezing

The freeze is lifted only per surface and per change, through the gates above.
A change that passes its gate does not weaken the baseline for other surfaces.
