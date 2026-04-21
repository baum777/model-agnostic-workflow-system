---
name: ui-to-backend-contract-extractor
description: Derive backend, API, and state contracts from explicit UI flow and interaction evidence without redesigning product behavior.
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

# UI To Backend Contract Extractor

## Purpose

Extract backend/API/state contract expectations from UI flows, interaction states, and frontend behavior descriptions.

## Trigger

Use this skill when UI evidence exists and backend contracts must be derived without inventing new product semantics.

## When Not To Use

- Do not use for UI critique, usability review, or visual quality scoring.
- Do not use for backend implementation review of existing services.
- Do not use for generic contract extraction when the source is not UI behavior.
- Do not use for implementation planning or task slicing.
- Do not use when UI evidence is vague, contradictory, or incomplete.

## Required Inputs

- explicit UI flow or state-transition evidence
- interaction events/actions and expected user-visible outcomes
- existing known backend boundaries, if provided
- declared constraints and unresolved UI ambiguities

## Workflow

1. Normalize UI evidence into explicit flow and state segments.
2. Extract state assumptions and transition expectations implied by UI behavior.
3. Derive event/action surfaces and map them to required backend/API interactions.
4. Identify validation constraints and failure-handling expectations from UI outcomes.
5. Separate observed UI evidence from inferred backend contract assumptions.
6. Return a bounded extraction with unresolved ambiguities marked as open questions.

## Boundary Differentiation

- UI critique: use `ui-ux-composition` for composition-level critique or refinement.
- Backend review: use backend-specific audit/review surfaces for implementation correctness.
- Generic contract extraction: use `implementation-contract-extractor` for non-UI anchored artifacts.
- Implementation planning: use `planning-slice-builder` or `spec-to-task-breakdown` for execution decomposition.

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
- `UI EVIDENCE INPUT`
- `STATE ASSUMPTIONS`
- `EVENT / ACTION SURFACES`
- `BACKEND / API EXPECTATIONS`
- `VALIDATION / CONSTRAINT NOTES`
- `OPEN QUESTIONS / AMBIGUITIES`
- `NEXT ACTIONS`

## Quality Checks

- Every derived contract item must map to explicit UI evidence or be labeled inferred.
- State assumptions must be consistent with UI transitions.
- Event/action surfaces must identify backend/API expectations, not implementation guesses.
- Validation notes must include boundary and failure-condition constraints.
- Missing or contradictory UI evidence must fail closed with unresolved ambiguities.

## Nearest Sibling Skills

- `core/skills/ui-ux-composition/SKILL.md`
- `skills/implementation-contract-extractor/SKILL.md`
- `core/skills/research-synthesis/SKILL.md`
- `skills/planning-slice-builder/SKILL.md`
