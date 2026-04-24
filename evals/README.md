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
- OBS contract-rule checks (`eval:obs`) for blocking rule coverage with advisory rule isolation
- PBC contract-rule checks (`eval:pbc`) for permission-boundary blocking rule coverage with advisory/deferred rule isolation
- WMC contract-rule checks (`eval:wmc`) for memory-contract blocking rule coverage with deferred cross-module rule isolation
- MAHP contract-rule checks (`eval:mahp`) for handoff-envelope blocking rule coverage with deferred receiver/runtime semantics
- RGC contract-rule checks (`eval:rgc`) for deterministic resource-governor blocking rule coverage with advisory/deferred rule isolation
- TSC contract-rule checks (`eval:tsc`) for deterministic trigger/scheduling blocking rule coverage with advisory/deferred rule isolation

## Gate Rule

- `npm run eval` is the executable certification entrypoint.
- Any blocking eval failure should stop release or publication.
- Advisory-only checks should be recorded but not treated as release blockers.
- Module-specific runs:
  - `npm run eval:obs`
  - `npm run eval:pbc`
  - `npm run eval:wmc`
  - `npm run eval:mahp`
  - `npm run eval:rgc`
  - `npm run eval:tsc`

## Module Extension Posture

- `eval:obs`, `eval:pbc`, `eval:wmc`, `eval:mahp`, `eval:rgc`, and `eval:tsc` are deterministic shared-core contract checks.
- These module evals are validator-backed candidates for module semantics, not global mandatory consumer migration gates.
- Advisory rules in module fixtures remain non-blocking in this slice.
- Runtime implementation and enforcement engines remain out of scope for these evals.
