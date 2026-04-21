---
name: incident-runbook-composer
description: Compose structured incident and recovery runbooks from failure conditions and operational risk evidence.
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

# Incident Runbook Composer

## Purpose

Produce action-oriented incident runbooks for detection, containment, escalation, recovery, and follow-up from explicit failure and operational evidence.

## Trigger

Use this skill when incident response steps must be derived from known failure conditions, risks, or operational scenarios.

## When Not To Use

- Do not use for failure-mode enumeration only.
- Do not use for incident narrative summaries without action sequencing.
- Do not use for readiness review verdicts.
- Do not use for broad operational documentation not tied to incident handling.
- Do not use when incident evidence is too incomplete to derive safe actions.

## Required Inputs

- failure conditions, incident scenario, or operational risk signals
- system boundaries, dependencies, and control surfaces
- known escalation and ownership boundaries, if available
- recovery constraints and rollback expectations

## Workflow

1. Normalize incident scenario evidence and identify trigger conditions.
2. Extract diagnosis cues and immediate action priorities.
3. Derive containment steps and escalation thresholds.
4. Define recovery sequence and verification checkpoints.
5. Capture post-incident follow-up actions and unresolved evidence gaps.
6. Return a fail-closed runbook where missing evidence blocks unsafe guidance.

## Boundary Differentiation

- Failure-mode enumeration: use `failure-mode-enumerator` for risk surface discovery.
- Incident summary: this skill outputs action runbooks, not narrative recaps.
- Readiness review: use `readiness-check` for gate decisions.
- General ops docs: this skill is incident-specific and step-oriented.

## Tool Requirements

- `failure-mode-enumerator`
- `readiness-check`
- `test-matrix-builder`

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
- `TRIGGER CONDITIONS`
- `DIAGNOSIS CUES`
- `IMMEDIATE ACTIONS`
- `CONTAINMENT STEPS`
- `ESCALATION CONDITIONS`
- `RECOVERY STEPS`
- `POST-INCIDENT FOLLOW-UP`
- `OPEN GAPS`
- `NEXT ACTIONS`

## Quality Checks

- Immediate actions must be concrete and orderable.
- Containment and escalation steps must include clear transition conditions.
- Recovery steps must include verification cues where possible.
- Open gaps must be explicit when evidence is insufficient.
- Never overclaim incident resolution certainty from partial evidence.

## Nearest Sibling Skills

- `skills/failure-mode-enumerator/SKILL.md`
- `core/skills/readiness-check/SKILL.md`
- `core/skills/repo-audit/SKILL.md`
- `skills/post-implementation-review-writer/SKILL.md`
