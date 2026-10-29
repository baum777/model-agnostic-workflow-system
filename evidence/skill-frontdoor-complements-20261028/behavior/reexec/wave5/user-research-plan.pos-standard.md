# User Research Plan — FieldOps offline-mode decision (fresh re-execution)

Invocation record: agent re-execution, 2026-10-29 · Model: zai-individual-coding-plan/GLM-5.3 (ZCode session agent) · Skill: `core/skills/user-research-plan`, content digest `sha256:a2c000f9dd038f2ea537353f02f6086558584765fa6eba1b70f45bb91856e13e` · Input: `cases/user-research-plan/pos-standard/research-brief.md` · This file is committed verbatim as produced; it supersedes nothing and is not edited after the run (see `execution-record.json` for why this re-execution exists).
No sessions were conducted, no participants contacted, and no personal data processed in producing this plan.

## EVIDENCE BASE

Observed (with sources):
- 47 tickets in 90 days mention "no signal"/"offline" during work-order steps; 11 mention re-done photo uploads (ticket-system export, aggregate).
- Weak connection at median completion in 23% of orders; photo-upload retries in 9% (app analytics, aggregate only).
- 2 account-manager call summaries (notes, no recordings, no verbatim quotes).

Hypotheses (unverified, product team):
- H1: technicians lose significant time to retries in weak-connectivity phases.
- H2: offline mode would change task ordering (photos offline, sync later).
- H3: reporting redesign matters more than offline mode.

The aggregates make H1 plausible (11 re-upload tickets; 9% retry rate). Plausible is not confirmed — ticket counts do not measure lost time.

## QUESTIONS

Neutral and non-leading, one primary per hypothesis:

- H1: "Walk me through your last work order where the connection was poor — what happened, step by step?"
- H1: "When an upload fails mid-order, what do you do next?"
- H2: "If the app kept working with no signal at all, how would you order the steps of a typical order?"
- H2: "Which steps would you still wait to do online, and why?"
- H3: "You have 15 spare minutes at the depot — what do you open first, and for what?"
- Closing: "What in the app costs you the most time that we haven't talked about?"

## METHOD

- 6–8 sessions × 30 minutes (constraint ceiling), scheduled in the weekly maintenance hour, recruited through dispatch coordinators — the only reachable channel — with a neutral invite naming the topic "how work orders go in the field" rather than "offline mode problems" so H1/H2 are not primed.
- Participants: active technicians with at least one work order in the last 30 days; spread across regions if the aggregate data allows targeting.
- Format: retrospective walkthrough of one real poor-connectivity order; then the H2 re-ordering exercise; then a matched-description preference comparison for H3 (offline mode vs. reporting redesign, equal polish, so preference is not driven by mockup quality).
- The account-manager notes orient question phrasing only; they are second-hand and never cited as data.

## PRIVACY

- Consent: explicit, recorded per participant — a short written line read aloud and confirmed at recording start, covering session, transcription, and the 90-day retention cap; declining any part is honored without disadvantage. Participation alone is not consent.
- Minimization: no names, emails, phone numbers, or customer identifiers in research artifacts; sessions referenced as P01–P0n; transcripts carry role and region only.
- Retention: recordings deleted after transcription review; transcripts capped at 90 days (company policy); EU participants expected, GDPR-grade handling assumed.
- No CRM records, per-user event logs, or external profile data enter this study; the supplied aggregates stay aggregate and are never used to re-identify anyone.

## ANALYSIS

Criteria fixed before any session exists:

- H1 confirmed if at least half of participants independently describe a retry loop that materially delays completion in their walkthrough; refuted if poor-connectivity phases are rare or handled without rework; otherwise quantify from walkthrough counts only.
- H2 confirmed if a majority reorder steps in a way offline mode would enable; refuted if ordering is driven by other constraints (safety, customer presence).
- H3: per-participant forced preference; the reporting redesign wins only at ≥ 2/3; anything closer is a split roadmap flag, not a winner.
- Decision rule: build offline mode in Q1 only if H1 and H2 confirm and H3 shows no ≥ 2/3 redesign preference; otherwise defer and attach these results to the redesign review.

## LIMITS

- No sessions have run; everything above is plan. The only observed data are the aggregate counts in EVIDENCE BASE.
- n=6–8 in one region mix tests the friction hypotheses, not adoption effects — sufficient for the decision at hand, no broader claim.
- Self-reported time estimates are excluded (memory bias); only walkthrough-observed steps count for H1.
- Until recorded, consented sessions run under this plan, nothing here may be cited as user-research findings.
