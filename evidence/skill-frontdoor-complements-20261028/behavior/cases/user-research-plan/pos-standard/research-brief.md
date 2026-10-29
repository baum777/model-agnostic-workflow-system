# Input: field-service offline-mode research brief (fixture)

Source: `cases/user-research-plan/pos-standard/research-brief.md` (fixture, self-contained;
hand-authored planning artifact — the agent-executed OUTPUT for this case is recorded
separately in the execution record, not authored here)

```text
Decision to inform: whether to build offline mode for the FieldOps mobile app
in Q1, or defer it in favor of the reporting redesign.

Research question: what does field technicians' actual connectivity and
task-flow experience during work orders support — building offline mode now,
or not?

Known evidence (owner-supplied, with sources):
- Support tickets, last 90 days, aggregate counts from the ticket system export:
  47 tickets mention "no signal" or "offline" during work-order steps
  (11 mention re-doing photo uploads after signal loss).
- App analytics, last 90 days: median work-order completion happens with
  connection classified "weak" in 23% of orders; photo-upload retries occur
  in 9% of orders. (Aggregate metrics only; no per-user records supplied.)
- 2 prior customer-call summaries written by account managers (notes only,
  no recordings, no verbatim quotes).

Participant constraints: technicians are reachable only via their dispatch
coordinators; max 30 minutes per session; scheduling window is the weekly
maintenance hour; no access to customer sites.

Data retention rules (company policy): no direct identifiers stored beyond
the session; recordings must be deleted after transcription review; retention
cap 90 days for transcripts; EU participants expected.

Working hypotheses (from the product team, unverified):
H1: Technicians lose significant time on retries in weak-connectivity phases.
H2: Offline mode would change task ordering (more photos taken offline, synced later).
H3: The reporting redesign matters more to technicians than offline mode.
```
