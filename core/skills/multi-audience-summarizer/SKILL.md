---
name: multi-audience-summarizer
description: Convert one evidence-backed findings body into bounded summaries for explicit audience modes without changing factual truth.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: model-agnostic-workflow-system
status: extracted
output_contract_path: core/contracts/output-contracts.json
tool_contract_catalog_path: core/contracts/tool-contracts/catalog.json
provider_projection_path: core/contracts/portable-skill-manifest.json
eval_profile_path: evals/catalog.json
---

# Multi Audience Summarizer

## Purpose

Produce audience-specific summaries from one shared findings body while preserving evidence boundaries and factual consistency.

## Trigger

Use this skill when the same findings must be communicated to multiple explicit audience classes with different operational needs.

## When Not To Use

- Do not use for generic rewriting or tone-only paraphrasing.
- Do not use when the source findings body is missing, mixed, or untrusted.
- Do not use for criteria-weighted option comparison; use `tradeoff-matrix-builder`.
- Do not use to write final decision memos with approval language.
- Do not use to translate UI/spec text into implementation contracts.

## Required Inputs

- one bounded findings body with explicit evidence, inferences, and open gaps
- requested audience mode set from supported modes only
- communication objective and scope boundary
- constraints (length, risk emphasis, operational urgency, non-goals)

## Supported Audience Modes

- `technical`: preserves technical causality, assumptions, and implementation constraints.
- `operator`: emphasizes run-state impact, rollout/rollback implications, and guardrails.
- `stakeholder-executive`: emphasizes decision relevance, risk exposure, and business impact without deep internals.
- `implementation-focused`: emphasizes concrete change implications, dependencies, and next execution steps.

## Workflow

1. Validate that one canonical findings body is present and bounded.
2. Normalize findings into shared fact blocks (observed, inferred, unresolved).
3. Reject unsupported audience modes and keep only the allowed mode set.
4. Generate one summary per requested audience mode from the same fact blocks.
5. Apply mode-specific emphasis without introducing new facts or recommendations.
6. Run cross-mode consistency checks to ensure no factual drift.
7. Return summaries with explicit traceability and unresolved gaps.

## Boundary Differentiation

- Summarizing content: this skill summarizes one findings body for bounded audiences.
- Comparing options: use `tradeoff-matrix-builder` when evaluating alternatives against criteria.
- Writing decision memos: this skill prepares audience briefs, not decision authority language.
- Translating UI/spec into contracts: use `implementation-contract-extractor` for contract extraction.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`

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
- approval boundary
- provider parity
- failure modes

## Output

- `SUMMARY`
- `SOURCE FINDINGS`
- `REQUESTED AUDIENCE MODES`
- `MODE BRIEFS`
- `CROSS-MODE CONSISTENCY CHECK`
- `ASSUMPTIONS AND GAPS`
- `NEXT ACTIONS`

## Quality Checks

- Every mode brief must map to the same source findings body.
- No mode brief may introduce facts absent from source findings.
- Inference vs observation boundaries must stay explicit in each mode.
- Unsupported audience requests must return BLOCKED with allowed modes.
- Stakeholder/executive brief must remain non-technical without losing risk truth.

## Nearest Sibling Skills

- `core/skills/research-synthesis/SKILL.md`
- `core/skills/long-document-to-knowledge-asset/SKILL.md`
- `skills/post-implementation-review-writer/SKILL.md`
- `skills/release-narrative-builder/SKILL.md`
- `core/skills/tradeoff-matrix-builder/SKILL.md`
- `skills/implementation-contract-extractor/SKILL.md`
