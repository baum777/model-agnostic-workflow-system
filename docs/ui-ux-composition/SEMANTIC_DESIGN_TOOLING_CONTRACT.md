# Semantic Design Tooling Contract (v1)

Class: operational.
Use rule: applies to deterministic semantic-design tools under `scripts/tools`; this is an implementation contract note, not a visual-runtime claim.

## Covered Tools

- `analyze-content-semantics-for-design.mjs`
- `generate-visual-direction-contract.mjs`
- `lint-semantic-design-contracts.mjs`
- `derive-oklch-palette.mjs`
- `eval-semantic-layout-decisions.mjs`

## Guaranteed Checks

- bounded field outputs for semantic profile and visual-direction contract
- deterministic rule-based derivation with explicit evidence/rationale links
- contract linting for required fields, enum boundedness, contradiction checks, and responsive/accessibility caution notes
- role-based OKLCH palette derivation with explicit intent-level contrast guardrails
- semantic-layout fixture evals that check consistency and over-stylization prevention
- bounded golden-ratio usage through `proportionRule` (`none` or `golden-ratio-macro-only`) so proportion remains subordinate to readability and responsiveness

## Explicit Non-Claims

- no probabilistic NLP or model-based semantic inference
- no rendered UI, screenshot, DOM-runtime, or computed-style analysis
- no subjective full design-review verdicts
- no guarantee of final WCAG rendered contrast without downstream runtime verification
- no rendering-posture recommendation (`static`, server-rendered dynamic, hydration); that belongs to a separate rendering advisor surface
