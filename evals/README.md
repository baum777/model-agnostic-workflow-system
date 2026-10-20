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
- skill-effectiveness behavioral evals (`eval:skill-effectiveness`, S5) for baseline/candidate comparison over the `evals/skill-effectiveness/` corpus: recorded-transcript replay is the deterministic CI mode, live-model runs record enforced/declared isolation honestly (`recorded_replay` is enforced by construction; an uncontained live executor records `isolated: false` and can never carry an improvement-proof verdict), the security-regression family blocks every variant, and cost/latency signals are captured into canonical BehavioralEvalRecords
- context-assembly evals (`eval:context-assembly`, S6) for adaptive context assembly over the `evals/context-assembly/` scenarios: a full-context baseline and reduced candidates are assembled over the real instruction tree and the eval proves reduction, retention of every canonical binding source, conflict-free eligibility with fail-closed blocking of missing required context sources, and digest determinism/sensitivity; behavioral equivalence of a reduction remains the S5 behavioral gate's job
- harness-context contract checks (`eval:maws-vnext`, fixture `harness-context.contracts.json`, S11) for the closed two-value harness-context vocabulary, the `authority_grant: none` posture, the dev/product authority-surface coupling, and the evidence-backed context-change supersession record; semantic R1-R6 enforcement lives in `runtime/harness-context/context-binding.mjs` and is covered by `tests/vnext/harness-context.test.mjs` (missing or contradictory context bindings bind no executor, and there is no fallback path)
- comparative benchmark harness (`eval:benchmark-comparison`, S13) over the fixed `evals/benchmark/comparison/` task set: a static single-executor baseline against a policy-bound multi-executor candidate measuring token, cost, latency, intervention, verification, and artifact-quality deltas; worker context isolation and authority/budget inheritance are checked fail-closed, the composition candidate goes through the real composition policy gate (decomposition is never chosen merely because executors are available), counterproductive cases and routing/composition selection criteria are recorded, and the record is comparison evidence only (comparison_only const true)

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
  - `npm run eval:skill-effectiveness` (exit 0 only when the candidate improvement is proven against the recorded baseline; security regressions or behavioral regressions exit 2)
  - `npm run eval:context-assembly` (exit 0 only when reduction-with-retention, eligibility and digest determinism are all proven; any violated property exits 2)

## Module Extension Posture

- `eval:obs`, `eval:pbc`, `eval:wmc`, `eval:mahp`, `eval:rgc`, and `eval:tsc` are deterministic shared-core contract checks.
- These module evals are validator-backed candidates for module semantics, not global mandatory consumer migration gates.
- Advisory rules in module fixtures remain non-blocking in this slice.
- Runtime implementation and enforcement engines remain out of scope for these evals.
- `eval:skill-effectiveness` gates evidence, not authority: a proven improvement is reproducible evidence for an owner promotion decision (S8 scope), never the decision itself. The model_parity family is non-blocking in this slice; full cross-model Pareto comparison is S10/S13 scope.
- `eval:context-assembly` gates assembly evidence, not authority: a proven reduction is reproducible evidence that no binding rule or required context source was lost; it grants no permission and the bundle digest is a behavior-input binding, never a permission token.
