# UI/UX Composition Bundle

Class: derived.
Use rule: this bundle is advisory internal branch taxonomy. It supports the canonical charter at [../ui-ux-composition-branch.md](../ui-ux-composition-branch.md) and does not create a second authority path.

## Purpose

This bundle organizes the branch into readable internal layers for composition, policies, modes, routing, modules, examples, and tests.

## Contents

- [CONSTITUTION.md](CONSTITUTION.md)
- [SEMANTIC_DESIGN_TOOLING_CONTRACT.md](SEMANTIC_DESIGN_TOOLING_CONTRACT.md)
- [ROUTING.md](ROUTING.md)
- [MODES.md](MODES.md)
- [POLICIES/GOLDEN_RATIO_POLICY.md](POLICIES/GOLDEN_RATIO_POLICY.md)
- [POLICIES/TYPOGRAPHY_POLICY.md](POLICIES/TYPOGRAPHY_POLICY.md)
- [POLICIES/SPACING_POLICY.md](POLICIES/SPACING_POLICY.md)
- [POLICIES/HIERARCHY_POLICY.md](POLICIES/HIERARCHY_POLICY.md)
- [POLICIES/RESPONSIVE_POLICY.md](POLICIES/RESPONSIVE_POLICY.md)
- [POLICIES/UX_CLARITY_POLICY.md](POLICIES/UX_CLARITY_POLICY.md)
- [POLICIES/ACCESSIBILITY_ALIGNMENT_POLICY.md](POLICIES/ACCESSIBILITY_ALIGNMENT_POLICY.md)
- [MODULES/](MODULES/)
- [EXAMPLES/](EXAMPLES/)
- [TEST_CASES/](TEST_CASES/)

## Branch Rule

- Canonical truth lives in the branch charter and shared-core authority docs.
- The module docs are advisory and internal.
- Tool contracts remain contract-only until a real runtime surface exists.
- Semantic-design outputs stay deterministic where tooling exists (`scripts/tools` semantic-design commands).
- Golden-ratio guidance is bounded and subordinate to semantic clarity, accessibility, responsiveness, and readability.
- Rendering posture decisions (`static` vs server-rendered dynamic vs hydration) are outside this bundle and belong to `static-vs-dynamic-rendering-advisor`.
