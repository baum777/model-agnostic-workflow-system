---
name: source-conflict-resolver
description: Resolve contradictions between truth surfaces with explicit evidence weighting, fail-closed outputs, and unresolved-conflict tracking.
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

# Source Conflict Resolver

## Purpose

Reconcile conflicting claims across specs, docs, repo evidence, and runtime-related surfaces using a structured, fail-closed conflict-resolution method.

## Trigger

Use this skill when multiple sources disagree and a bounded canonical interpretation is needed to continue safely.

## When Not To Use

- Do not use for generic summarization when no conflict exists.
- Do not use as a substitute for repo intake mapping.
- Do not use for audit/report writing when conflict resolution is not required.
- Do not use for drift detection only without contradiction analysis.
- Do not use when no evidence-bearing source set is provided.

## Required Inputs

- explicit source set with conflicting or potentially conflicting claims
- source provenance metadata (path, date, authority tier when available)
- decision context that requires reconciliation
- constraints on acceptable confidence or escalation threshold

## Workflow

1. Normalize sources and claims into a comparable claim inventory.
2. Separate agreed facts from conflicting claims.
3. Weight evidence by source provenance, authority, recency, and direct observability.
4. Produce a recommended canonical interpretation only when evidence is sufficient.
5. Mark unresolved conflicts and escalation needs where confidence is insufficient.
6. Return follow-up actions required to close contradictions safely.

## Boundary Differentiation

- Generic summarization: use `research-synthesis` when no contradiction resolution is required.
- Repo intake: use `repo-intake-sot-mapper` for initial truth-surface mapping.
- Audit/reporting: use `repo-audit` for repository state assessment without claim arbitration.
- Drift detection only: this skill resolves conflicting claims, not just drift signals.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`
- `git-diff-explainer`

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
- `SOURCE SET`
- `AGREED FACTS`
- `CONFLICTING CLAIMS`
- `EVIDENCE WEIGHTING / CONFIDENCE`
- `RECOMMENDED CANONICAL INTERPRETATION`
- `UNRESOLVED CONFLICTS`
- `REQUIRED FOLLOW-UP`
- `NEXT ACTIONS`

## Quality Checks

- Agreed facts must be evidence-backed and traceable to source paths.
- Conflicting claims must be represented without forced consensus.
- Confidence weighting must be explicit and bounded by available evidence.
- Recommendation must be fail-closed when contradictions remain unresolved.
- Distinguish evidence, interpretation, and recommendation explicitly.

## Nearest Sibling Skills

- `skills/repo-intake-sot-mapper/SKILL.md`
- `core/skills/repo-audit/SKILL.md`
- `core/skills/research-synthesis/SKILL.md`
- `core/skills/readiness-check/SKILL.md`
