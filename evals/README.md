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
- comparative benchmark harness (`eval:benchmark-comparison`, S13) over the fixed `evals/benchmark/comparison/` task set: a static single-executor baseline against a policy-bound multi-executor candidate over the same task set, eval family and executor profile, measuring token, cost, latency, intervention, verification and artifact quality. Every dimension is derived, not asserted: the verification outcome comes from an independent verifier executor over the merged artifact, the artifact quality from the recorded artifact content against the quality floor, the composed routing only where the real composition policy gate accepted it (executor bound, allowed mode and parallelism bound enforced), and the counterproductive cases from compositions the candidate actually evaluated and then rejected because the measurement was worse. Worker and verifier context isolation and the inherited authority/budget boundaries are checked fail-closed, a composed task must show a measured advantage, and the record is comparison evidence only (comparison_only const true)
- skill promotion chain (`promote-skill-candidate`, S8): the owner-governed canonical adoption path binding the skill frontdoor admission to the exact candidate identity AND the exact screened content, the S5 behavioral eval evidence to the promoted skill, one corpus and a declared age bound, the canonical owner approval to the approved candidate digest, the versioned adoption to the superseded version READ FROM THE CANONICAL TREE, and the applied change to an append-only adoption ledger; the post-adoption readback fails closed, the export regeneration is recorded truthfully (not performed by this slice), a contract-invalid promotion leaves no mutation behind, and the record grants no authority (`authority_granted` const false)
- skill-improvement proposal contract checks (`eval:maws-vnext`, fixture `skill-improvement-proposal.contracts.json`, S4) for the closed §8.4 reuse/extend/create decision vocabulary, the spec §8.3 error-class to responsible-area mapping, the closed target-skill rule (`target_skill_ref` only for `REUSE`/`EXTEND_SKILL`), the owner-review rule for skill-changing and unattributed proposals, the "no skill change when the cause lies in the tool contract or the runtime" rule, and the authority-free posture (`authority_granted: false`); the Stage-2 diagnose and Stage-3 proposal semantics live in `runtime/skills/feedback-analyzer.mjs` and `runtime/skills/improvement-classifier.mjs` and are covered by `tests/vnext/skill-improvement.test.mjs`
- model-adaptive executor profile checks (`npm run validate-executor-model-profile`, fixture `executor-model-profile.contracts.json`, S12) for the model-adaptive presentation layer: the schema cases decide the contract shape (the six invariant semantics dimensions are `const "unchanged"`, the qualification-relevant dimensions and the effective instruction digest are pinned, `authority_grant` is `none`), and the `denial_cases` decide the runtime behavior — the happy path must resolve the executor profile, and each denial case must be refused with exactly its typed code (`MODEL_PROFILE_SEMANTICS_WIDENED`, `MODEL_PROFILE_QUALIFICATION_UNCOVERED`, `MODEL_PROFILE_HARNESS_CAPABILITY_MISSING`, `MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT`); the validator also proves the S12 DoD invariant (two profiles of the same model produce equivalent authority and completion semantics) and that no profile switch widens authority. Runtime enforcement lives in `runtime/harness-context/profiles/model-adaptive/` and is covered by `tests/vnext/executor-model-profile.test.mjs`. A model-adaptive profile is a qualification input, never a qualification: the check gates a presentation binding, it grants no permission and changes no execution-profile dimension
- skill-selection contract checks (`eval:maws-vnext`, fixture `skill-selection.contracts.json`, DSI) for the closed selection record: the selection inputs (request, intent fingerprint, scope, required capabilities), the candidate set with each candidate's identity and content digest, the per-candidate eligibility verdict, the closed outcome vocabulary (`SELECTED` | `REFUSED`) with its typed refusal codes, the closed deterministic ordering rule, the evidence digest that binds the decision to the registry snapshot, and the authority-free posture (`authority_granted: false`); the fail-closed loader (`runtime/skills/skill-registry-loader.mjs`, denial codes `SKILL_NOT_FOUND` / `SKILL_DIGEST_MISMATCH` / `SKILL_STATE_NOT_ALLOWED` / `SKILL_CAPABILITY_MISSING`) and the deterministic selector (`runtime/skills/skill-selector.mjs`) are covered by `tests/vnext/skill-selection.test.mjs` (determinism, scope isolation, tie-breaking and refusal-not-fallback included)

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
- The S4 skill-improvement proposal fixture gates record shape only: a valid proposal proves that a cause, a responsible owner and a bounded change scope are stated together — it proves no improvement and grants no authority; the improvement proof stays with the S5 behavioral gate and the promotion decision stays with the S8 governance review.
- The DSI skill-selection fixture gates record shape only: a valid selection record proves that a candidate set, its per-candidate eligibility verdicts, a deterministic ordering key and a digest-bound choice are stated together — it proves no skill is fit to run and grants no authority; the skill frontdoor admission gate stays the precondition for a skill to be usable at all, and the activation decision stays with the caller.
