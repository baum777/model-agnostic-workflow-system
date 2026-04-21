---
name: ui-ux-composition
description: Governed UI/UX composition branch for semantic visual direction, layout rhythm, color/typography posture, spacing, responsiveness, and UX clarity.
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

# UI/UX Composition

## Purpose

Produce bounded UI/UX branch outputs from explicit content and structure signals, including semantic visual direction, semantic layout composition, semantic color posture, and tone-aware typography posture, without taking product, brand, or technical runtime authority.

## Trigger

Use this skill when a request needs a bounded design-intelligence branch that can generate, audit, refine, normalize, or tokenize interface composition from semantic content cues without taking product or technical authority.

## When Not To Use

- Do not use for product logic, business rule changes, or technical execution authority.
- Do not use when the task requires native screenshot interpretation, DOM-runtime assertions, or computed-style truth claims.
- Do not use when the input is only a vague aesthetic request with no structure, content, or constraints.
- Do not use for standalone brand-strategy or identity-definition work.
- Do not use for runtime rendering posture decisions (`static`, server-rendered dynamic, hydration boundary decisions); use `static-vs-dynamic-rendering-advisor`.

## Required Inputs

- declared objective and mode (`generate`, `audit`, `refine`, `normalize`, `tokenize`)
- artifact context (page/screen type, content blocks, user/task intent, constraints)
- known evidence for semantics (tone, audience, density, hierarchy, urgency/trust/authority cues) when available
- explicit non-goals and constraints (accessibility, responsiveness, readability, system consistency)

## Workflow

1. Identify the branch mode, artifact type, product context, and available structure.
2. Normalize semantic evidence from content and structure; when needed, use deterministic semantic tooling (`analyze-content-semantics-for-design`, `generate-visual-direction-contract`, optional `derive-oklch-palette`, optional `eval-semantic-layout-decisions`).
3. Apply the override order: semantic clarity, usability, accessibility, readability, information hierarchy, responsive integrity, system consistency, proportional harmony, aesthetic refinement.
4. Route through the branch taxonomy only as an advisory internal structure, not as executable subskills.
5. Emit the requested branch artifact with stable required fields and any result-type-specific optional fields, making semantic posture explicit in findings/recommendations.
6. Mark unsupported visual-runtime claims as missing rather than inferred.

## Boundary Differentiation

- Semantic visual direction: in scope as bounded posture advice derived from content semantics (not brand identity definition).
- Semantic layout composition: in scope as hierarchy/rhythm/density/scanability guidance (not generic wireframing detached from content semantics).
- Semantic color-system posture: in scope as role-oriented semantic guidance (not decorative palette generation).
- Tone-aware typography posture: in scope as readability/hierarchy posture guidance (not arbitrary font-family curation).
- Golden ratio: in scope only as bounded macro proportion heuristic, never as a dominant rule.
- Rendering posture (`static`, server-rendered dynamic, hydration): out of scope; route to `static-vs-dynamic-rendering-advisor`.

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

- `branch`
- `mode`
- `result_type`
- `summary`
- `constraints_applied`
- `confidence`
- `findings`
- `recommendations`
- `review_report`
- `layout_blueprint`
- `token_pack`
- `refinement_plan`
- `next_actions`

## Quality Checks

- `audit` in v1 is descriptive, structural, token, and text-based only.
- Do not claim native screenshot, DOM-runtime, or computed-style truth.
- When semantic evidence is weak, mark recommendations as advisory and lower confidence rather than fabricating style certainty.
- Keep semantic design outputs bounded to evidence-backed posture classes; do not drift into broad brand strategy.
- Golden-ratio guidance is optional and macro-only; if it conflicts with semantic clarity, accessibility, responsiveness, readability, or implementation practicality, set proportion guidance to `none`.
- Keep the branch output narrow enough to remain testable and versionable.
- Treat visual analysis as valid only when it is already present as structured description input.
