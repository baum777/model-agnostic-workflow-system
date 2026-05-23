---
name: getdesign-style-router
description: Apply a matching style system from https://getdesign.md to generated documents, HTML pages, and PDFs by selecting the closest visual language and translating it into actionable design tokens. Use when a request asks for style polish, brand-inspired output, DESIGN.md-based output, or explicit visual direction for doc/html/pdf artifacts.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: model-agnostic-workflow-system
status: extracted
---

# Getdesign Style Router

## Overview

Select one style source from getdesign.md, extract its design language, and apply that language consistently to the requested artifact without copying brand assets or proprietary content.

## Trigger

Use this skill when a request asks for style polish, brand-inspired output, DESIGN.md-based output, or explicit visual direction for a document, HTML page, or PDF artifact.

## When Not To Use

- Do not use for application UI implementation; use the UI/UX composition surfaces for product interface work.
- Do not use when the user has already provided exact design tokens and does not want style routing.
- Do not use to copy logos, proprietary assets, or exact brand systems.
- Do not use when getdesign.md evidence or a direct style choice is unavailable.

## Workflow

1. Parse the artifact request.
2. Resolve the primary output format: `doc`, `html`, or `pdf`.
3. Read the target audience, domain, and tone from the prompt.
4. Pick the best matching getdesign entry:
   - Use explicitly requested style first (for example `Linear`, `Stripe`, `Notion`).
   - If no explicit style is requested, map domain and tone using `references/style-selection-map.md`.
   - Prefer entries that semantically match the use case shown in the listing text.
5. Open the style page and gather only observed style cues:
   - color posture
   - typography posture
   - layout density
   - component shape language
   - interaction/motion character (if relevant)
6. Build a compact token set for the current artifact.
7. Apply the token set directly in the generated output.
8. Include a short style decision note in the response with:
   - selected style URL
   - why it matched
   - any fallback assumptions

## Output Rules by Artifact

## Output

- `STYLE DECISION`
- `OBSERVED STYLE CUES`
- `INFERRED TOKEN GAPS`
- `APPLIED TOKENS`
- `ARTIFACT NOTES`
- `BLOCKERS`

### DOC

- Apply visual hierarchy via heading scale, spacing rhythm, and accent usage.
- Keep text readability first; style is secondary to structure.
- Mirror the selected style's tone through section headers, separators, and callout blocks.

### HTML

- Define CSS custom properties for colors, typography, spacing, radius, and elevation.
- Use the variables everywhere; avoid one-off hardcoded values.
- Apply layout, cards, buttons, and links consistently with the selected style posture.

### PDF

- Apply page-level consistency: margins, heading rhythm, body measure, and accent system.
- Keep contrast and legibility suitable for print and screen.
- Preserve semantic structure (title, sections, tables/callouts) while styling.

## Fail-Closed Conditions

- If no plausible style match can be derived, mark the style decision as `BLOCKED` and ask for one preferred style.
- If getdesign is unavailable, state the unavailability and request a direct style choice.
- Do not claim that copied branding, logos, or exact proprietary design systems were applied.

## Implementation Notes

- Treat getdesign entries as inspiration and translation inputs, not as exact replicas.
- Keep distinctions explicit:
  - `Observed`: style clues directly visible on getdesign pages
  - `Inferred`: mapped choices used to complete missing details
  - `Applied`: actual tokens/layout decisions used in output
- Load `references/style-selection-map.md` when style choice is ambiguous.

## Quality Checks

- Cite observed style cues separately from inferred choices.
- Keep generated tokens readable and artifact-appropriate.
- Preserve document, HTML, or PDF semantic structure while applying style.
- Fail closed when style selection has no evidence.
- Do not claim copied branding or proprietary design-system fidelity.
