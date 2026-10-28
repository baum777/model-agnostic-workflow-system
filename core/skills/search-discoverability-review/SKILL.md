---
name: search-discoverability-review
description: Review search and AI-discoverability of owned surfaces from crawl and content evidence — indexability, duplication and canonicalization, intent fit, and measurable actions — without ranking guarantees or bulk publishing.
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

# Search Discoverability Review

## Trigger

Use this skill when owned URLs, supplied crawl data, or live content surfaces need a discoverability assessment — what the technical and content evidence actually shows about indexability, duplication, and intent fit, and which improvements are measurable rather than promised.

## When Not To Use

- Do not use to judge visual composition or design quality; use the native `ui-ux-composition` skill.
- Do not use to choose rendering postures for page regions; use the native `static-vs-dynamic-rendering-advisor` skill.
- Do not use to publish, rewrite, or bulk-apply content changes — this skill reviews and proposes, it never publishes.
- Do not use to promise rankings, traffic, or AI-answer placement; search engines are external systems outside repository control.

## Purpose

Ground every discoverability statement in dated crawl and content evidence, separate observed evidence from inferred intent mapping, and convert the difference into measurable, crawl-verifiable actions with explicit limits.

## Boundary Differentiation

- `ui-ux-composition` evaluates visual quality; this skill evaluates crawl and content evidence — the two need different inputs and neither implies the other.
- `static-vs-dynamic-rendering-advisor` treats discoverability expectations as one rendering constraint; this skill audits the resulting surface's indexability, duplication, and metadata from evidence.
- Content production belongs to writing and summarization surfaces; this skill reviews discoverability of what exists, it does not draft replacement content.

## Workflow

1. Establish the evidence basis: which URLs are in scope, what crawl data, snapshots, or exports were supplied, and when they were collected — an assessment without crawl or content evidence is a blocker, not a reduced-confidence result.
2. Assess structure, metadata, and indexability from that evidence: titles and descriptions, headings, robots rules, sitemap coverage, canonical and hreflang declarations, structured data, and blocked-or-orphaned URL patterns.
3. Check duplication and canonicalization: parameter and trailing-slash variants, staging or preview hosts leaking into scope, near-duplicate content, and canonical chains or conflicts.
4. Review content claims against search intent: whether each surface's stated content goal matches what searchers and AI-answer systems can extract from the evidence, keeping observed evidence and inferred intent mapping visibly separate.
5. Propose measurable improvements and limitations: every action must be verifiable from a future crawl or log comparison — no traffic, ranking, or AI-answer-inclusion targets.
6. List what remains unknown without fresh crawls, server logs, or search-console-class data the repository does not hold.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`
- `git-diff-explainer`
- `validate-repo-surface`

## Local Inputs

- repository root
- owned URLs or supplied crawl data with collection dates
- content goals per surface
- current technical evidence (metadata, canonical, robots, sitemap, structured-data snapshots)
- constraints on what may not change

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

- `EVIDENCE`
- `INDEXABILITY`
- `CONTENT`
- `ACTIONS`
- `LIMITS`

## Quality Checks

- never guarantee rankings, traffic, or AI-answer placement; improvements are stated as crawl-verifiable changes, never as outcome promises
- never auto-publish or bulk-apply changes; the output is a review with actions, not a rollout
- never call paid SEO or analytics APIs without explicit scope; work only from supplied or owner-provided evidence
- every evidence item carries its collection date; stale evidence is flagged as stale, never silently treated as current
- keep observed evidence, inferred intent mapping, and recommended actions distinct
- unowned or third-party surfaces are out of scope unless the owner explicitly supplies their evidence
