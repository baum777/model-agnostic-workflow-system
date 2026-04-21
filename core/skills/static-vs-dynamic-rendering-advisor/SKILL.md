---
name: static-vs-dynamic-rendering-advisor
description: Recommend bounded rendering posture (static, server-rendered dynamic, hydrated interactive) for page regions using content volatility, interaction needs, and operational constraints.
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

# Static Vs Dynamic Rendering Advisor

## Purpose

Provide bounded rendering-posture recommendations per page region: static suitability, server-rendered dynamic suitability, and client hydration need, while preserving fail-closed reasoning on volatility, UX, and maintainability tradeoffs.

## Trigger

Use this skill when the task is deciding how a page or page region should be rendered (`static`, server-rendered dynamic, or hydrated interactive) based on content semantics, volatility, interaction behavior, and operational constraints.

## When Not To Use

- Do not use for infrastructure topology or deployment-platform architecture decisions.
- Do not use for detailed frontend implementation planning or framework-specific coding.
- Do not use for UI critique, visual polish, or brand-direction requests.
- Do not use for backend contract extraction or API schema design.

## Required Inputs

- page/region inventory or equivalent UI surface decomposition
- volatility evidence per region (build-time stable, periodic update, request-time variable, user-specific)
- interaction requirements per region (read-only, light interaction, high interactivity)
- UX constraints (latency targets, SEO/discoverability expectations, first-load behavior)
- operational constraints (cacheability, complexity tolerance, maintainability posture)

## Workflow

1. Normalize the rendering decision scope into explicit regions with clear boundaries.
2. Assess each region on three axes: data volatility, interaction depth, and UX freshness/latency constraints.
3. Classify each region into a primary posture:
   - `static` for stable, low-volatility, low-interaction regions.
   - `server-rendered-dynamic` for request-time or frequently changing regions with low-to-medium client interaction needs.
   - `hydrated-interactive` for regions that require meaningful client-side state transitions or interaction loops.
4. Record tradeoffs for each classification: performance, complexity, maintainability, and volatility risk.
5. Fail closed on missing evidence by marking assumptions and confidence reductions instead of asserting posture certainty.
6. Return a bounded recommendation set with region-level rationale and next validation steps.

## Boundary Differentiation

- This skill decides rendering posture, not visual direction or layout composition.
- This skill does not replace `ui-ux-composition`; it complements it by handling runtime rendering strategy boundaries.
- This skill does not choose deployment providers, runtime infrastructure, or backend architecture.
- This skill does not perform contract extraction from UI semantics.

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
- `RENDERING DECISION SCOPE`
- `REGION CLASSIFICATION`
- `STATIC SUITABILITY`
- `SERVER-RENDERED DYNAMIC SUITABILITY`
- `CLIENT INTERACTIVITY / HYDRATION NEED`
- `PERFORMANCE AND VOLATILITY TRADEOFFS`
- `MAINTAINABILITY NOTES`
- `ASSUMPTIONS AND GAPS`
- `NEXT ACTIONS`

## Quality Checks

- Default to simpler posture when evidence does not justify higher runtime complexity.
- Avoid hydration recommendations for read-only regions without interaction evidence.
- Keep recommendations region-bounded and evidence-backed; avoid full-stack redesign claims.
- Distinguish observed volatility/interaction signals from inferred assumptions.
- If posture confidence is low, mark BLOCKED-style gaps rather than presenting decisive recommendations.
