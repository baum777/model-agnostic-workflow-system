# Marketing Strategy Plan — Taskloop Q4 signup growth (agent execution)

Invocation record: agent execution, 2026-10-29 · Model: zai-individual-coding-plan/GLM-5.3 (ZCode session agent) · Skill: `core/skills/marketing-strategy-plan` · Input: `cases/marketing-strategy-plan/pos-standard/request.md` · Committed verbatim as produced; per-case provenance in `evidence/skill-frontdoor-complements-wave10-20261029/execution-record.json`.
Worked only from the supplied evidence; nothing was executed, published, or scheduled, and no market or competitor figure was invented.

## SITUATION

Observed (with source and date):
- 340 signups in 90 days; 61% via the two integration-marketplace listings; 12% via the docs onboarding page; remainder unattributed (signup analytics export, collected 2026-10-21).
- 44% of signups activate (first task within 7 days) — same export.
- The 2026-10-20 discoverability review's `/docs/getting-started` findings were fixed 2026-10-22; **no post-fix crawl exists**, so the fix's effect is unmeasured (review on file + founder-confirmed fix date).
- Field-service companies repeatedly contact support (founder note, 2026-10-23) — recorded as a founder observation, not a measured channel.

Hypotheses (no supplied source):
- H1: the marketplace listings convert because field teams already search integration directories — mechanism, not measurement.
- H2: the support-mail inquiries indicate a reachable field-services segment via direct outreach — untested.
- H3: the onboarding fix lifts docs-page conversion — plausible, unmeasured until a fresh crawl + cohort data exist.

Unknown: market size, competitor positioning, audience composition — no supplied data; not estimated anywhere in this plan.

## OPTIONS

| # | Option | Underlying hypothesis | Mechanism | Scope (4 h/week cap) | Falsified by |
|---|---|---|---|---|---|
| A | Do nothing | — | — | 0 | — |
| B | Instrument + re-measure first: fresh crawl, attribution cleanup, cohort tracking | H3 | Makes every later option measurable | ~1 h/week | Post-fix crawl shows no change and attribution stays murky |
| C | Marketplace listing deepening (third listing, listing-page content per the two that convert) | H1 | Doubles down on the only proven channel | ~2 h/week | New listing gets no incremental signups in 6 weeks |
| D | Support-mail outreach pilot (personal replies → 20-min calls, n=10) | H2 | Tests the founder-observed segment cheaply | ~1 h/week | <3 of 10 conversations show purchase-relevant intent |
| E | Docs onboarding content expansion | H3 | Rides the fixed entry page | ~2 h/week | Docs traffic rises, signup share doesn't |

Ranking rationale (shown, re-rankable): B first — it is cheap and every other option's check depends on measurement. C second: only channel with observed conversion evidence (H1 rests on the 61% figure). D third: cheapest test of the only new segment signal. E after B's measurement exists. A is retained as the honest baseline; against a 4 h/week cap, B+C+D fit simultaneously.

## PLAN

| Action | Owner role | First step | Measurable check | Review | Mandate needed |
|---|---|---|---|---|---|
| B: fresh crawl + attribution cleanup | repo/tooling owner | Post-fix crawl of quolin.dev-equivalent surfaces; fix last-touch attribution in the analytics export | Crawl dated + attribution coverage % in next export | +2 weeks | none (repo-owned) |
| C: marketplace deepening | founder | Draft third listing + sharpen the two converting listings' descriptions | Signups via marketplace: ≥ baseline share (61%) with higher absolute count | +6 weeks | marketplace account = existing owner account; no spend |
| D: support-mail pilot | founder | Reply personally to the 10 most recent field-service inquiries with a call offer | ≥3/10 conversations with purchase-relevant intent | +4 weeks | **outreach mandate**: using support mailboxes for marketing contact needs an explicit owner decision — flagged, not assumed |
| E: docs expansion | content owner | Blocked until B's crawl lands | Docs-page signup share vs. 12% baseline | +8 weeks | comms-lead approval for any published page change |

Explicitly NOT in this plan: paid spend (no mandate supplied), blog publication (requires comms-lead approval, not requested), any social/channel execution.

## BOUNDARIES

- H2's outreach touches real people: even the pilot needs the outreach mandate above — inclusion in this plan is a recommendation, not an authorization, and this skill executes nothing.
- Paid spend stays out until an owner creates a budget mandate; the plan deliberately pre-computes nothing for it.
- Blog/documentation publication needs the named approvals; those gates are carried, not bypassed.
- The advisor presentation can show this plan as-is: observed figures carry sources and dates, everything else is labeled H1–H3.

## LIMITS

- All conversion figures age from the 2026-10-21 export; the plan should be re-baselined when B's re-measurement lands.
- 340 signups / 90 days is a small base: percentage shifts in channel shares are noisy; checks use absolute counts where possible.
- No market, competitor, or audience-size data exists in the supplied material — the plan makes no claim about them instead of estimating.
- H1–H3 are the plan's load-bearing assumptions; B exists largely to retire them quickly.
