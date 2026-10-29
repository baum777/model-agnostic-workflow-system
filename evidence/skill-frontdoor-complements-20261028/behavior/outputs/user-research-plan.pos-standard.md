# User Research Plan — FieldOps offline-mode decision

Executed by: agent (reviewer run, 2026-10-29) ·
Model: zai-individual-coding-plan/GLM-5.3 (ZCode session agent) ·
Invocation: `core/skills/user-research-plan` applied to `cases/user-research-plan/pos-standard/research-brief.md` (output executed once, committed verbatim; sha256 recorded in the execution record) ·
Skill content digest: `sha256:a2c000f9dd038f2ea537353f02f6086558584765fa6eba1b70f45bb91856e13e` ·
No sessions were conducted, no participants contacted, and no personal data processed in producing this plan.

## EVIDENCE BASE

Observed (with sources, from the brief):
- 47 support tickets in 90 days mention "no signal"/"offline" during work-order steps; 11 mention re-doing photo uploads (ticket-system export, aggregate).
- "Weak" connection at median work-order completion in 23% of orders; photo-upload retries in 9% (app analytics, 90 days, aggregates only).
- 2 account-manager call summaries exist (notes only, no recordings, no verbatim quotes).

Hypotheses (product team, unverified — to be tested, not restated as findings):
- H1: significant time lost on retries in weak-connectivity phases.
- H2: offline mode would change task ordering (photos offline, sync later).
- H3: reporting redesign matters more than offline mode.

The observed aggregates make H1 plausible (11 re-upload tickets, 9% retry rate) — plausible is not confirmed; the ticket counts do not measure lost time.

## QUESTIONS

Neutral, non-leading, mapped to hypotheses; asked open-form, no expected answer presupposed:

- H1: "Walk me through your last work order where the connection was poor — what happened, step by step?" (not: "How much time do you lose when offline?" — presupposes loss)
- H1: "When an upload fails, what do you do next?"
- H2: "If the app kept working with no signal, how would you order the steps of a typical order?"
- H2: "Which steps would you still delay until back online, and why?"
- H3: "When you have 15 spare minutes at the depot, what do you open first — and what for?"
- Closing: "What about the app costs you the most time that we haven't discussed?"

## METHOD

- 6–8 sessions × 30 min (constraint: max 30), scheduled inside the weekly maintenance hour, recruited via dispatch coordinators (constraint: only reachable channel) with a neutral invite that names the topic as "how work orders go in the field", not "offline mode problems" (avoids priming H1/H2).
- Participants: active technicians with ≥ 1 work order in the last 30 days; mix of connectivity profiles if available from aggregate regions (not individual-level data).
- Format: retrospective walkthrough of one real recent order with poor connectivity, then the H2 ordering exercise, then preference comparison (H3) between concrete descriptions of offline mode and the reporting redesign — descriptions matched in polish so preference isn't driven by mockup quality.
- Account-manager call summaries are used only as orientation for question phrasing, not as data (no verbatim quotes exist to cite).

## PRIVACY

- Consent: participants give explicit recorded consent (written one-liner read aloud, confirmed verbally on the recording start) covering session, transcription, and 90-day retention; declining any part is honored without disadvantage. Participation alone is not consent to anything.
- Minimization: no direct identifiers — no names, emails, phone numbers, or customer identifiers — collected in research artifacts; sessions referenced as P01–P0n; transcripts hold role and region only.
- Retention per policy: recordings deleted after transcription review; transcripts capped at 90 days; EU participants expected, so the plan assumes GDPR-grade handling and no transfer outside the agreed storage.
- The supplied aggregates (tickets, analytics) stay aggregate — no attempt to re-identify from them. No CRM data, no per-user event logs, no external profile enrichment: none is needed for these hypotheses and none was authorized.

## ANALYSIS

Criteria fixed before any session exists:

- H1 confirmed if ≥ half of participants independently describe a retry loop that materially delays order completion in their walkthrough; refuted if poor-connectivity phases are rare or handled without rework; mixed → quantify from the walkthrough counts, not memory estimates.
- H2 confirmed if a majority reorders steps in a way offline mode would support (photo capture before connectivity-dependent steps); refuted if order is driven by other constraints (safety, customer presence).
- H3: forced preference counted per participant; reporting redesign wins only if it is chosen by ≥ 2/3 — anything closer flags a split decision for the roadmap, not a winner.
- Decision rule: build offline mode in Q1 only if H1 and H2 confirm AND H3 does not show a 2/3 preference for the redesign; otherwise defer and schedule the redesign review with these results attached.

## LIMITS

- No sessions have run; every statement above is plan, not result — the counts in EVIDENCE BASE are the only observed data.
- n=6–8 in one region mix cannot settle adoption effects; it can confirm or refute the friction hypotheses, which is all the decision needs.
- Self-reported time estimates are excluded by design (memory bias); only walkthrough-observed steps count toward H1.
- The account-manager notes are second-hand and unverified; they shape questions, never conclusions.
- Findings exist only after recorded, consented sessions run under this plan — until then, nothing here may be cited as user research results.
