---
name: timeline-engagement-policy-review
description: Reviews timeline engagement thresholds, candidate ranking, and engagement policy in organoid_Symbionts.
version: 1.0.0
repo: organoid_Symbionts
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Review the candidate selection policy for timeline engagement so the runtime stays conservative and bounded.

## Trigger
Use when timeline thresholds, candidate scoring, or engagement cooldowns change.

## When to use
- Auditing timeline candidate ranking
- Checking cooldown or threshold variables
- Reviewing whether a timeline path can write too aggressively

## When not to use
- Mention polling that does not involve timeline engagement
- Prompt or lore edits with no engagement effect

## Required inputs
- `src/config/timelineEngagementConfig.ts`
- `src/engagement/*`
- `src/worker/pollTimelineEngagement.ts`
- `docs/workflows/mention-handling.md`

## Workflow
1. Trace the candidate from signal to engagement decision.
2. Check the scoring thresholds and cooldown logic.
3. Confirm the policy remains fail-closed when evidence is weak.
4. Mark any default value that is only inferred from current code.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Candidate gating is explicit
- Cooldown limits are documented and bounded
- Timeline engagement does not bypass approval gates

## Repo grounding notes
- `src/config/timelineEngagementConfig.ts`
- `src/engagement/candidateBoundary.ts`
- `src/engagement/scoreTimelineCandidate.ts`
- `src/engagement/rankTimelineCandidates.ts`
- `src/worker/pollTimelineEngagement.ts`
- `docs/workflows/mention-handling.md`

