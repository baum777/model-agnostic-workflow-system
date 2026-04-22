# Maintainer Commands

Operational command appendix. These are command wrappers, not exported tool declarations. For hierarchy and rules, see [architecture.md](architecture.md) and [usage.md](usage.md).

Use `<consumer-root>` in the examples below to stand in for the consumer repository root.

## Qwen Bootstrap Lifecycle

1. Initialize the consumer-local Qwen bootstrap once.
2. Inspect and customize the overlay locally.
3. Validate the bootstrap after initialization.
4. Revalidate after every local Qwen edit.

The generated `.qwen` tree is a consumer-local scaffold. It is not shared-core runtime authority, and init must not silently overwrite existing local overlay content.

## Refresh a Consumer Lock (helper-only)

```bash
npm run refresh-lock -- --consumer <consumer-root>
```

Updates the consumer manifest with the current shared-core version and fingerprint.

## Build the Neutral Registry (helper-only)

```bash
npm run build-registry -- --write
```

Regenerates `core/contracts/core-registry.json` and the compatibility mirror in `contracts/core-registry.json` from the current skills, tool catalog, and provider capability profile.

## Build the Provider Exports (helper-only)

```bash
npm run build-exports -- --provider openai
```

Regenerates `providers/<provider>/export.json` from the neutral registry and provider capability profile. Omit `--provider` to rebuild every provider export. Canonical provider names are `openai-codex`, `anthropic-claude`, `qwen-code`, and `kimi-k2_5`.

## Release Certification Gate (validator-backed + helper-only flow)

```bash
npm run build-registry -- --write
npm run build-exports
npm run validate
npm run validate-neutral
npm run eval
```

Use this bounded sequence before release/adoption handoff when canonical contracts, skills, policies, registry semantics, or provider exports changed.

## Run Certification Evals (validator-backed)

```bash
npm run eval
```

Runs the deterministic certification fixtures in `evals/` against the generated registry and provider export bundles.

## Run Skill Routing Eval Slice (validator-backed)

```bash
npm run eval:skill-routing
```

Runs only the `kind: "skill-routing"` certification fixtures.

## Validate a Consumer (validator-backed)

```bash
npm run validate-consumer -- --consumer <consumer-root>
```

Checks the consumer manifest, shared-core path, version, fingerprint, adopted skills, and local overlay files.

## Validate the Neutral Core (validator-backed)

```bash
npm run validate-neutral
```

Checks the neutral registry, provider capability profile, provider adapter scaffolds, and registry/tool consistency.

## Validate a Local Input Contract (validator-backed)

```bash
npm run validate-input-contract -- --contract <consumer-root>/.codex/repo-intake-inputs.json
```

Confirms that a shared-with-local-inputs skill has the repo-local source declarations it needs.

## Validate a Runtime Policy Contract (validator-backed)

```bash
npm run validate-runtime-policy-input-contract -- --contract <consumer-root>/.codex/runtime-policy-inputs.json
```

Confirms that `runtime-policy-auditor` only reads the runtime policy surfaces the consumer repo explicitly declared.

## Validate a Qwen Bootstrap Overlay (validator-backed)

```bash
npm run validate-qwen-bootstrap -- --consumer <consumer-root>
```

Checks the consumer-local `.qwen` scaffold for required settings, extension manifest fields, resource files, agent contracts, skill contracts, and broken references.

## Detect Skill Overlap (helper-only)

```bash
npm run detect-skill-overlap
```

Reports heuristic overlap, near-duplicates, naming collisions, and routing ambiguity risk across `core/skills` and `skills`.

## Lint Skill Contracts (validator-backed)

```bash
npm run lint-skill-contracts
```

Checks skill files for required contract sections and frontmatter fields, then reports warnings for missing purpose/inputs/boundary clarity.

## Analyze Skill-Tree Coverage (helper-only)

```bash
npm run analyze-skill-tree-coverage
```

Classifies current skills into capability families and reports weak or overconcentrated coverage as advisory analysis.

## Analyze Content Semantics For Design (helper-only)

```bash
npm run analyze-content-semantics-for-design -- --input <path-to-content-or-json>
```

Builds a deterministic semantic profile for content type, tone posture, density, hierarchy, cue levels, and audience hints.

## Generate Visual Direction Contract (helper-only)

```bash
npm run generate-visual-direction-contract -- --input <semantic-profile-json>
```

Derives a bounded visual-direction contract from the normalized semantic profile.

## Lint Semantic Design Contracts (validator-backed)

```bash
npm run lint-semantic-design-contracts -- --input <visual-direction-contract-json>
```

Validates semantic-design contracts for required fields, bounded enums, contradiction checks, rationale refs, and responsive/accessibility guardrails.

## Derive OKLCH Palette (helper-only)

```bash
npm run derive-oklch-palette -- --input <semantic-profile-or-visual-contract-json>
```

Derives role-based OKLCH palette recommendations with explicit intent-level guardrail checks.

## Run Semantic Layout Eval Slice (validator-backed)

```bash
npm run eval:semantic-layout
```

Runs only `kind: "semantic-layout"` certification fixtures.

## Check Render/A11y Runtime (validator-backed)

```bash
npm run check-render-a11y-runtime
```

Verifies pinned Playwright/Axe/Lighthouse runtime dependencies before blocking render/accessibility certification checks run.

## Render Page Snapshots (validator-backed)

```bash
npm run render-page-snapshots -- --input evals/fixtures/render-layout-cases.json
```

Captures deterministic screenshot artifacts and blocking DOM/layout metrics across configured breakpoints.

## Run Axe Accessibility Audit (validator-backed)

```bash
npm run run-axe-accessibility-audit -- --input evals/fixtures/wcag-a11y-cases.json
```

Runs normalized Axe accessibility scans for fixture pages using bounded WCAG tag sets.

## Run Lighthouse Page Audit (validator-backed)

```bash
npm run run-lighthouse-page-audit -- --input evals/fixtures/wcag-a11y-cases.json
```

Runs normalized Lighthouse accessibility/quality category audits for fixture pages.

## Assert Layout Contract Rendered (validator-backed)

```bash
npm run assert-layout-contract-rendered -- --input <contract-plus-snapshots.json>
```

Checks machine-usable semantic-contract-to-render assertions and reports pass/fail/not-assessed outcomes.

## Compare Render Breakpoints (validator-backed)

```bash
npm run compare-render-breakpoints -- --input <render-snapshot-report.json>
```

Detects responsive contradictions and major regressions while treating small visual differences as non-blocking unless readability/hierarchy/overflow constraints fail.

## Lint WCAG Structure (validator-backed)

```bash
npm run lint-wcag-structure -- --input evals/fixtures/wcag-a11y-cases.json
```

Runs deterministic structural WCAG-style lint checks in addition to automated scanner evidence.

## Run Render Layout Eval Slice (validator-backed)

```bash
npm run eval:render-layout
```

Runs only `kind: "render-layout"` certification fixtures (local fixtures only, blocking).

## Run WCAG A11y Eval Slice (validator-backed)

```bash
npm run eval:wcag-a11y
```

Runs only `kind: "wcag-a11y"` certification fixtures (local fixtures only, blocking).

## Initialize a Consumer Overlay (initializer/scaffold)

```bash
npm run init-consumer -- --consumer <consumer-root>
```

Creates the minimal overlay files and a local validator wrapper if they do not already exist.

## Initialize a Qwen Bootstrap Overlay (initializer/scaffold)

```bash
npm run init-qwen-bootstrap -- --consumer <consumer-root>
```

Creates the consumer-local `.qwen` scaffold from the shared template pack. Re-running init is intentionally non-destructive and fails if `.qwen` already exists.

## When to Use These Commands

- use `refresh-lock` for helper-only linkage refreshes
- use `validate-consumer` for validator-backed consumer linkage checks before rollout or review
- use `build-registry` when `core/skills/`, `skills/`, `core/contracts/tool-contracts/catalog.json`, or provider capability profiles change
- use `build-exports` when canonical provider adapter scaffolds or provider capability profiles change
- use `eval` when certification fixtures, registry semantics, or provider export bundles change
- use `eval:skill-routing` when routing precision or overlap-avoidance behavior is changed
- use `validate-neutral` after changing the neutral registry, provider scaffolds, or adapter boundary docs
- use `init-consumer` for the first initializer/scaffold pass in a new repository
- use `validate-input-contract` whenever a consumer adopts `repo-intake-sot-mapper`
- use `validate-runtime-policy-input-contract` whenever a consumer adopts `runtime-policy-auditor`
- use `detect-skill-overlap` to inspect potential near-duplicate or ambiguous sibling skill boundaries
- use `lint-skill-contracts` to validate contract shape consistency across skill files
- use `analyze-skill-tree-coverage` to inspect advisory family coverage and concentration
- use `analyze-content-semantics-for-design` to generate deterministic semantic design profiles from content inputs
- use `generate-visual-direction-contract` to turn semantic profiles into bounded visual-direction contracts
- use `lint-semantic-design-contracts` to enforce contract completeness, boundedness, and internal consistency
- use `derive-oklch-palette` to derive role-based OKLCH palette recommendations from semantic/contract signals
- use `eval:semantic-layout` when semantic-to-layout consistency logic or fixtures change
- use `check-render-a11y-runtime` before blocking render/accessibility certification checks
- use `render-page-snapshots` to capture deterministic render evidence across breakpoints
- use `run-axe-accessibility-audit` to collect scanner-based accessibility evidence
- use `run-lighthouse-page-audit` to collect normalized Lighthouse category evidence
- use `assert-layout-contract-rendered` to verify contract-to-render coherence with machine-checkable assertions
- use `compare-render-breakpoints` to detect responsive regressions and contradictions
- use `lint-wcag-structure` to enforce structural WCAG guardrails beyond scanner output
- use `eval:render-layout` when rendered layout verification logic or fixtures change
- use `eval:wcag-a11y` when accessibility verification logic or fixtures change
- use `init-qwen-bootstrap` for the first consumer-local Qwen scaffold pass only
- use `validate-qwen-bootstrap` after generating or editing the consumer-local Qwen scaffold
