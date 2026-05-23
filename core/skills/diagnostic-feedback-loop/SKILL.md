---
name: diagnostic-feedback-loop
description: Diagnose a reproducible failure with evidence-first loops: reproduce, minimize, hypothesize, instrument, verify, and preserve regression evidence before recommending a fix.
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

# Diagnostic Feedback Loop

## Purpose

Turn a failing command, bug report, regression, or unexpected behavior into a bounded diagnosis before implementation work begins.

## Trigger

Use this skill when a task starts from a failure, flaky behavior, unexpected output, or blocked validation gate and the root cause is not yet proven.

## When Not To Use

- Do not use for broad repository audits where no concrete failure exists.
- Do not use when the root cause is already proven and the task is only patch execution.
- Do not use to replace `test-matrix-builder` when the main need is broad coverage planning.
- Do not use to bypass fail-closed authority checks when the failure involves governance, secrets, credentials, runtime control, or release gates.

## Required Inputs

- failing command, observed error, or bug report
- available reproduction steps or statement that reproduction is missing
- relevant file paths, logs, fixtures, or validation output
- constraints on allowed tools, write access, and external state

## Workflow

1. Capture the observed failure exactly, including command, output, path, and environment assumptions.
2. Reproduce the failure or mark reproduction as missing; do not propose fixes until reproduction status is explicit.
3. Minimize the failing surface to the smallest command, fixture, path, or behavior that still demonstrates the problem.
4. Compare the failing path with the nearest working pattern in the same repo.
5. Form one testable hypothesis that explains the failure and identify the evidence that would falsify it.
6. Add or request temporary instrumentation only when existing evidence cannot locate the failing boundary.
7. Recommend the smallest fix only after the hypothesis is supported, and name the regression evidence that must pass after the fix.
8. If evidence is insufficient, return `BLOCKED` with the missing reproduction, logs, permissions, or source paths.

## Boundary Differentiation

- Use `source-conflict-resolver` when the main problem is contradictory authority or source claims.
- Use `failure-mode-enumerator` when the main task is pre-implementation risk analysis rather than an observed failure.
- Use `test-matrix-builder` when the diagnosis is complete and coverage needs to be planned across layers.
- Use `readiness-check` when the question is whether a completed slice can advance to the next gate.

## Tool Requirements

- `repo-structure-scanner`
- `git-diff-explainer`
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
- `OBSERVED FAILURE`
- `REPRODUCTION STATUS`
- `MINIMIZED FAILURE SURFACE`
- `WORKING COMPARISON`
- `HYPOTHESIS`
- `EVIDENCE / INSTRUMENTATION`
- `ROOT CAUSE CONFIDENCE`
- `RECOMMENDED FIX BOUNDARY`
- `REGRESSION EVIDENCE`
- `BLOCKERS`
- `NEXT ACTIONS`

## Quality Checks

- Do not recommend a fix before reproduction status and hypothesis evidence are explicit.
- Keep one active hypothesis at a time unless the output clearly separates competing hypotheses.
- Distinguish environment failures from repo behavior failures.
- Regression evidence must map to the minimized failure surface.
- Missing logs, permissions, or source paths must be reported as blockers, not guessed around.

## Nearest Sibling Skills

- `core/skills/source-conflict-resolver/SKILL.md`
- `skills/failure-mode-enumerator/SKILL.md`
- `skills/test-matrix-builder/SKILL.md`
- `core/skills/readiness-check/SKILL.md`
