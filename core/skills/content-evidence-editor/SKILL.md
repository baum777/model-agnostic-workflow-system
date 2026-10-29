---
name: content-evidence-editor
description: Edit draft content with claim-level evidence discipline — every claim marked sourced, inferred, or unsupported, quotes and citations verified against supplied sources, and editorial approval never treated as publication authority.
version: 1.0.0
classification: shared-with-local-inputs
requires_repo_inputs: true
produces_structured_output: true
safe_to_auto_run: true
owner: model-agnostic-workflow-system
metadata:
  author: baum777 <baum777@users.noreply.github.com>
status: extracted
---

# Content Evidence Editor

## Trigger

Use this skill when a draft — post, documentation page, announcement, or report — must be edited so that every factual claim is backed by supplied evidence or visibly flagged, attribution points at the source that actually states the claim, and the approval/publication boundary stays clean.

## When Not To Use

- Do not use to adapt tone, length, or structure for an audience without a claim-evidence focus; use the native `multi-audience-summarizer` skill.
- Do not use to adjudicate which of several conflicting sources is right; use the native `source-conflict-resolver` skill.
- Do not use to review discoverability of published surfaces; use the native `search-discoverability-review` skill.
- Do not use to publish, schedule, or transmit content anywhere; this skill edits and reports, it never publishes — and editorial approval does not become a publication mandate.

## Purpose

Keep drafted content honest at the level of individual claims: what is stated must trace to a supplied source, what is inferred must be labeled as inference, and what has no supplied backing must remain visibly flagged — with an edit log that lets the owner audit every change against the evidence.

## Boundary Differentiation

- `multi-audience-summarizer` reshapes existing content for audiences; this skill enforces claim-level evidence discipline on the content's statements — a summary can be audience-fit and still carry unflagged unsupported claims.
- `source-conflict-resolver` decides between disagreeing sources; this skill maintains correct attribution to whichever sources the owner supplies and flags conflicts it cannot resolve.
- `brand-asset-brief` and `media-production-brief` govern asset and production work; this skill governs textual claims in drafts.
- Publication belongs to the owner's channel process; this skill's output states the approval boundary and stops there.

## Workflow

1. Establish the evidence basis: which supplied sources (documents, transcripts, data exports, URLs with dates and locators) may back claims. Editing without any supplied source basis can only produce flags, never support.
2. Build the claim inventory: decompose the draft into atomic claims and classify each one — SOURCED (with a locator into the supplied basis), INFERENCE (derived from supplied material, labeled as such), or UNSUPPORTED (flagged; not smoothed, not dropped silently).
3. Verify attribution: each citation must point to the source that actually states the claim, at the most precise locator the source allows. Fix misattributions; a paraphrase must not strengthen, broaden, or tighten what the source states.
4. Verify quotes: quotations are checked verbatim against supplied source text; omissions and emphasis are marked. A quote that cannot be located in supplied material is removed or flagged — never reconstructed from memory or plausibility.
5. Verify numbers: statistics and facts must match a supplied source and carry its collection date; derived figures show their derivation; rounding may not change meaning.
6. Mark, don't smooth: unsupported claims stay visible in the edited draft with what evidence would close them; markers are machine-findable, not prose apologies.
7. State the approval boundary: record the editorial approval state (approved for accuracy/readiness, pending, or none) and name publication as a separate owner act with its own mandate — the output contains no publication step.
8. Produce the edit log: per-claim disposition (kept / corrected / flagged / removed) so every modification is auditable against the source basis.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`
- `git-diff-explainer`
- `validate-repo-surface`

## Local Inputs

- repository root
- the draft under edit
- supplied sources with dates and locators
- editorial approval state
- publication constraints (channel, audience) as context only — never as a mandate

## Approval Mode

- read-only

## Provider Projections

- OpenAI/Codex: native
- Claude: adapter
- Qwen Code: adapter
- Kimi K2.5: adapter

## Eval Scaffolding

- routing
- schema conformance
- tool selection
- provider parity
- failure modes

## Output

- `CLAIMS`
- `ATTRIBUTION`
- `EDITS`
- `APPROVAL BOUNDARY`
- `LIMITS`

## Quality Checks

- never invent, reconstruct, or "complete" a quote, citation, statistic, or source; anything not verifiable against supplied material is flagged, never filled
- never let a paraphrase state more (or more precisely) than its source does
- never let an unsupported claim inherit support from being adjacent to sourced ones
- never present editorial approval as publication authority; approval covers content readiness, publishing is a separate owner act
- keep sourced claims, inferences, and drafted material visibly distinct in the output
- flag stale sources with their dates; never silently treat dated material as current
- no external lookups or paid retrieval without explicit scope; work from supplied sources only
