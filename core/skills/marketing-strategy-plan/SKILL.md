---
name: marketing-strategy-plan
description: Build a marketing strategy plan grounded in supplied product and evidence context — options with explicit hypotheses separated from observed facts, measurable actions with owners, and no invented market data, competitor claims, or channel actions without a mandate.
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

# Marketing Strategy Plan

## Trigger

Use this skill when a product, launch, or positioning question needs a strategy plan — which options exist, what the supplied evidence supports, what remains hypothesis, and which concrete actions follow, each with an owner and a measurable check.

## When Not To Use

- Do not use to plan studies about users or run research; use the native `user-research-plan` skill.
- Do not use to assess search/AI discoverability of owned surfaces; use the native `search-discoverability-review` skill.
- Do not use to brief brand assets or media production; use the native `brand-asset-brief` / `media-production-brief` skills.
- Do not use to execute channel activity — posting, campaigns, ads, outreach. This skill plans and proposes; every channel action needs its own mandate, and nothing is published here.

## Purpose

Separate what the supplied material shows from what is assumed, turn the difference into a small number of ranked, falsifiable moves, and keep every market, competitor, or audience claim traceable to a supplied source or visibly marked as hypothesis.

## Boundary Differentiation

- `user-research-plan` produces evidence about users; this skill consumes supplied evidence (which may include that skill's results) to structure marketing decisions.
- `search-discoverability-review` audits owned surfaces against crawl evidence; this skill treats such reviews as one input among supplied context.
- `brand-asset-brief` and `media-production-brief` prepare asset/production work; this skill decides what is worth doing and in which order — it never briefs or executes the work itself.
- Channel execution (publishing, campaigns, paid spend) belongs to mandated owner surfaces; this skill's output stops at recommended, owner-addressed actions.

## Workflow

1. Establish the evidence basis: product surface, goals, constraints, audience knowledge, and any supplied data (analytics exports, prior reviews, research results), each with its date. A plan without any supplied basis says so and proceeds only with labeled hypotheses.
2. State the situation: what is observed (with source), what is contested, what is unknown — no market-size, competitor, or audience claim without a supplied source behind it.
3. Generate options, including "do nothing"; each option lists its underlying hypothesis, expected mechanism, cost/scope sketch, and what evidence would falsify it.
4. Rank options against the supplied goals and constraints; show the ranking rationale so the owner can re-rank with different weights instead of inheriting hidden ones.
5. Convert the chosen direction into actions: each with owner role, concrete first step, a measurable check, and a review date; actions that require channels, spend, or publication name their needed mandate explicitly.
6. List limits and risks: what would change the plan, which hypotheses are load-bearing, and what evidence should be collected first.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`
- `git-diff-explainer`
- `validate-repo-surface`

## Local Inputs

- repository root
- product/goal statement and constraints
- supplied evidence with dates (analytics, prior reviews, research outputs)
- known audience or market knowledge, sourced or explicitly labeled as assumption
- mandate context: which channels/actions already carry an owner mandate (context only — never a new grant)

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

- `SITUATION`
- `OPTIONS`
- `PLAN`
- `BOUNDARIES`
- `LIMITS`

## Quality Checks

- never invent market sizes, competitor numbers, audience shares, or "industry best practice" statistics; anything without a supplied source is a labeled hypothesis, never a fact-shaped claim
- keep observed evidence (with source and date) visibly distinct from hypotheses and recommendations throughout
- no channel action, spend, campaign, or publication is executed or scheduled; actions name the mandate they need and stop there
- every recommended action carries an owner role, a concrete first step, and a measurable check — no unfalsifiable "raise awareness" items
- ranking rationale is shown, never hidden in the recommendation
- stale supplied data is flagged with its date, never silently treated as current
- no paid data retrieval or external scraping without explicit scope; work from supplied sources only
