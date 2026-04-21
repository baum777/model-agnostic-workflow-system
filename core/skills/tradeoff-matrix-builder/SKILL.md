---
name: tradeoff-matrix-builder
description: Build a structured tradeoff matrix across bounded options using explicit criteria, weighting, and uncertainty markers.
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

# Tradeoff Matrix Builder

## Purpose

Produce a decision-support matrix for option tradeoffs without collapsing into generic summary, readiness gating, or implementation planning.

## Trigger

Use this skill when multiple options, paths, or architecture choices must be compared against explicit criteria.

## When Not To Use

- Do not use for single-option summaries or paraphrasing.
- Do not use for merge/release readiness decisions.
- Do not use to design patch scope or implementation waves.
- Do not use when the decision question, options, or criteria are missing.

## Required Inputs

- decision question and scope boundaries
- explicit option set (minimum two options)
- evaluation criteria and, when available, criterion weights
- constraints (time, risk tolerance, compliance, cost, performance, operability)
- evidence notes or assumptions for each option

## Workflow

1. Normalize the decision question and scope boundaries.
2. Verify that option definitions are mutually distinguishable.
3. Normalize criteria and weights; mark any missing weighting model.
4. Score each option per criterion with evidence or explicit assumptions.
5. Build the matrix and identify dominant tradeoffs and reversibility costs.
6. Run sensitivity checks on key criteria to detect unstable recommendations.
7. Return a bounded recommendation with assumptions and unresolved gaps.

## Boundary Differentiation

- Summarizing content: use `research-synthesis` or `long-document-to-knowledge-asset` when the task is source condensation rather than option comparison.
- Comparing options: use this skill when criteria-weighted tradeoffs and sensitivity matter.
- Writing decision memos: this skill produces analysis substrate, not narrative stakeholder memo packaging.
- Translating UI/spec into contracts: use `implementation-contract-extractor` for contract extraction, not tradeoff analysis.
- Readiness checks: use `readiness-check` for gate verdicts backed by required evidence.
- Patch/design planning: use `planning-slice-builder` or `patch-strategy-designer` for implementation sizing and execution shape.

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
- `DECISION QUESTION`
- `OPTIONS UNDER REVIEW`
- `CRITERIA AND WEIGHTS`
- `TRADEOFF MATRIX`
- `SENSITIVITY AND SCENARIO NOTES`
- `RECOMMENDATION`
- `ASSUMPTIONS AND GAPS`
- `NEXT ACTIONS`

## Quality Checks

- Options must be comparable against the same criteria set.
- Scores or rankings must cite evidence or be labeled assumptions.
- Recommendation must reflect tradeoffs, not single-metric optimization.
- Sensitivity notes must call out criteria that can flip the recommendation.
- Uncertainty must be explicit; do not present inferred values as observed facts.

## Nearest Sibling Skills

- `core/skills/research-synthesis/SKILL.md`
- `core/skills/readiness-check/SKILL.md`
- `core/skills/migration-planner/SKILL.md`
- `skills/planning-slice-builder/SKILL.md`
- `skills/patch-strategy-designer/SKILL.md`
- `skills/implementation-contract-extractor/SKILL.md`
