---
name: secret-boundary-audit
description: Audit secret-bearing boundaries, provider-switch posture, trace redaction, and memory persistence from explicit repo evidence.
version: 1.0.0
classification: shared-with-local-inputs
requires_repo_inputs: true
produces_structured_output: true
safe_to_auto_run: true
owner: model-agnostic-workflow-system
status: extracted
output_contract_path: core/contracts/output-contracts.json
tool_contract_catalog_path: core/contracts/tool-contracts/catalog.json
provider_projection_path: core/contracts/portable-skill-manifest.json
eval_profile_path: evals/catalog.json
---

# Secret Boundary Audit

## Trigger

Use this skill when a repo, workflow slice, tool catalog, or provider projection needs an explicit secret-boundary audit before rollout or reuse.

## When Not To Use

- Do not use for generic code review with no secret-bearing boundary in scope.
- Do not use to invent runtime state that is not represented by repo evidence.
- Do not use to rotate credentials or mutate secrets directly.

## Workflow

1. Inspect canonical secret policy, machine-readable policy files, and relevant contracts.
2. Inventory tool, provider, trace, memory, and eval surfaces that touch secret-bearing data.
3. Separate implemented, advisory-only, missing, and inferred secret controls.
4. Call out fail-open paths, provider-switch reuse risk, and persistence or redaction gaps.
5. Return a bounded audit with exact file paths and classed findings.

## Tool Requirements

- `validate-secret-boundaries`
- `scan-secrets`
- `repo-structure-scanner`
- `spec-compliance-checker`

## Local Inputs

- repository root
- any repo-local secret policy, runtime policy, or consumer overlay paths that scope the audit

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
- secret-boundary cases

## Output

- `SUMMARY`
- `OBSERVED SECRET SURFACES`
- `BOUNDARY CLASSIFICATION`
- `EXPOSURE RISKS`
- `ROTATION AND INCIDENT GAPS`
- `NEXT ACTIONS`

## Quality Checks

- cite exact file paths
- distinguish implemented vs advisory vs missing vs inferred
- fail closed on missing secret-boundary evidence
- do not normalize provider-switch or memory-persistence ambiguity away
