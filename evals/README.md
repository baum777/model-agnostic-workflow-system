# Evals

Executable certification checks live here.

## Current Scope

- routing parity across exported provider bundles
- output schema stability for shared skills
- tool-selection checks for portable core skills
- approval boundary checks for mutating tools
- provider parity checks for shared skill output contracts
- failure-mode checks for contract-bound skills
- surface-decision checks for the repo-local `skill-tool-mcp-builder`, using normalized observed decision packets
- skill-routing checks for single-skill, multi-step, and false-positive routing outcomes, using normalized route packets
- workflow-routing checks for registry workflow class and MCP posture coverage
- workflow-evidence checks for required evidence artifacts and completion posture consistency per workflow class
- provider-export-alignment checks for canonical source-contract projection, capability-ownership projection, normalized provider capability states, and workflow/skill evidence metadata in provider exports
- semantic-layout checks for deterministic semantic-to-layout contract decisions and bounded over-stylization prevention
- render-layout checks for deterministic local-fixture render behavior across breakpoints, with DOM/layout metrics as blocking evidence
- wcag-a11y checks for deterministic local-fixture accessibility evidence using Axe, Lighthouse, and structural WCAG linting
- render/accessibility verification modes:
  - certification mode: local fixtures only, deterministic, blocking
  - operator-evidence mode: external URLs allowed, advisory and non-blocking
- core portable skill eval scaffolding under `evals/fixtures/core-*.json`

## Gate Rule

- `npm run eval` is the executable certification entrypoint.
- Any blocking eval failure should stop release or publication.
- Advisory-only checks should be recorded but not treated as release blockers.
