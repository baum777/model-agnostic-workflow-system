# Compatibility

Class: canonical.
Use rule: use this page to distinguish canonical shared-core ownership from compatibility/export mirrors; update canonical surfaces first.

## Objective

Provide a bounded compatibility contract so consumer repositories can adopt shared core without authority ambiguity.

## Canonical Versus Compatibility Surfaces

- Canonical machine-readable ownership:
  - `core/contracts/portable-skill-manifest.json`
  - `core/contracts/output-contracts.json`
  - `core/contracts/tool-contracts/catalog.json`
  - `core/contracts/workflow-routing-map.json`
  - `core/contracts/core-registry.json`
  - `core/contracts/provider-capabilities.json`
  - `core/contracts/observability-spine.json`
  - `core/contracts/permission-boundary.json`
  - `core/contracts/workflow-memory-contract.json`
  - `core/contracts/handoff-protocol.json`
  - `core/contracts/handoff-patterns.json`
  - `core/contracts/resource-governor.json`
  - `core/contracts/trigger-scheduling.json`
- Compatibility/export mirrors:
  - `contracts/core-registry.json`
  - `contracts/provider-capabilities.json`
  - `skills/` mirrors
  - `providers/openai/`, `providers/anthropic/`, `providers/qwen/`, `providers/kimi/`, `providers/codex/`
  - `docs/tool-contracts/catalog.json`

Compatibility/export surfaces are derived projections and must not become the source of canonical semantics.

## Consumer Adoption Rule

1. Adopt canonical surfaces first (`core/contracts/*`, `core/skills/*`, `policies/*`).
2. Treat compatibility/export surfaces as projections for legacy consumers.
3. If semantics change, update canonical contracts first, then regenerate mirrors and exports.
4. Fail closed when canonical and compatibility surfaces drift.

Current extension posture for `core/contracts/observability-spine.json`: contract-backed and opt-in; no new consumer-blocking validation gate is introduced by this contract alone.
Current extension posture for `core/contracts/permission-boundary.json` and `core/contracts/workflow-memory-contract.json`: contract-backed and opt-in; no new consumer-blocking validation gate is introduced by these contracts alone.
Current extension posture for `core/contracts/handoff-protocol.json` and `core/contracts/handoff-patterns.json`: contract-backed and opt-in; no new consumer-blocking validation gate is introduced by these contracts alone.
Current extension posture for `core/contracts/resource-governor.json` and `core/contracts/trigger-scheduling.json`: contract-backed and opt-in; no new consumer-blocking validation gate is introduced by these contracts alone.
Validator-backed and runtime-implemented maturity for extension modules remain bounded: module-scoped eval slices exist as validator-backed candidates only; consumer-global mandatory gating remains deferred.
Targeted validator-backed candidate eval slices now exist for OBS/PBC/WMC (`eval:obs`, `eval:pbc`, `eval:wmc`) and are module-scoped checks; this does not create a mandatory migration or automatic blocking gate for existing consumers.
`eval:mahp` is a minimal MAHP envelope-rule candidate slice only. MAHP defines no transport and no authorization engine; authorization remains in PBC scope, and runtime handoff orchestration remains blocked pending consumer evidence.
`eval:rgc` and `eval:tsc` are minimal candidate slices for deterministic RGC/TSC contract rules only. They do not introduce budget runtime enforcement, scheduler runtime behavior, or mandatory consumer migration.
MAHP may reference adjacent OBS/WMC/PBC contract surfaces in future consumer integrations, but this slice does not introduce cross-module runtime orchestration or mandatory consumer migration.

## Phase 10 Extension Posture (0.3.0 Opt-In Closeout)

- Release target remains `0.3.0` (opt-in posture).
- Extension modules (OBS, PBC, WMC, MAHP, RGC, TSC) are `contract-backed`.
- Module eval slices (`eval:obs`, `eval:pbc`, `eval:wmc`, `eval:mahp`, `eval:rgc`, `eval:tsc`) are shared-core deterministic evidence and validator-backed candidates only.
- Existing consumers are not automatically blocked and are not forced into migration by these module additions.
- Any future blocking consumer gate requires an explicit migration timeline update in this file first.

## 0.3.0 Migration Timeline Decision Record

### Current posture

- `0.3.0` remains non-breaking and opt-in for extension module adoption.
- Extension eval slices are shared-core evidence and validator-backed candidates only.
- Existing consumers are not automatically blocked by extension module eval slices.
- Runtime and enforcement implementation remain out of scope for `0.3.0`.
- Consumer overlays remain the adoption boundary.

Required wording:

- "No extension module eval is a default blocking consumer gate in 0.3.0."
- "Blocking adoption requires a separate migration decision."
- "Runtime enforcement is out of scope for 0.3.0."
- "Consumer overlays remain the boundary for adoption."

### Hardening prerequisites

Blocking consumer gate hardening for extension modules is permitted only after all prerequisites are met:

- explicit migration timeline entry exists in this file
- at least one consumer overlay has successful opt-in adoption evidence
- consumer fixtures exist for the affected module gate
- rollback/disable path is documented
- no open deferred cross-check remains for that gate class
- contract validation and runtime enforcement remain strictly separated
- `docs/authority-matrix.md` is updated for the hardening state
- changelog/release notes are updated for the hardening state
- shared-core gate suite remains green

### Gate classes

- Class A - Safe contract-shape gates:
  - examples: required-field shape, enum validation, version const, manifest declaration shape
  - hardening order: first possible class after consumer opt-in evidence exists
- Class B - Cross-module / cross-consumer gates:
  - examples: `PBC-V03`, `WMC-V04`, `RGC-V01`, `RGC-V02`, `RGC-V03`, `TSC-V05`, `TSC-V06`
  - posture: deferred until orchestrated fixture coverage and consumer evidence exist
- Class C - Runtime / enforcement gates:
  - examples: permission enforcement, memory store enforcement, scheduler execution, budget runtime enforcement, handoff receiver behavior, OBS sink/exporter behavior
  - posture: blocked until real runtime evidence exists; not part of `0.3.0` hardening

### Earliest migration posture

- `0.3.0`: contract-backed + eval-backed candidate, opt-in only
- `0.3.x`: optional consumer dry-run validation may be introduced
- `0.4.0` or later: earliest possible point for first blocking consumer gates, only with explicit migration timeline and adoption evidence

## Deferred Cross-Module / Cross-Consumer Checks

- `PBC-V03`
- `WMC-V04`
- `MAHP-V05`
- `MAHP-V06`
- `RGC-V01`
- `RGC-V02`
- `RGC-V03`
- `TSC-V05`
- `TSC-V06`

## Blocked Runtime / Enforcement Claims

- OBS runtime sink/exporter
- PBC permission enforcement engine
- WMC memory store
- MAHP handoff receiver/transport runtime
- RGC budget runtime engine
- TSC scheduler runtime
- global consumer-blocking validation gates

## Extension Module Completion Checklist

| module | contract | manifest declaration | eval slice | examples | authority/compatibility updated | runtime intentionally absent | consumer gates opt-in only |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OBS | yes | yes | yes (`eval:obs`) | deferred | yes | yes | yes |
| PBC | yes | yes | yes (`eval:pbc`) | deferred | yes | yes | yes |
| WMC | yes | yes | yes (`eval:wmc`) | deferred | yes | yes | yes |
| MAHP | yes | yes | yes (`eval:mahp`) | yes (`examples/mahp`) | yes | yes | yes |
| RGC | yes | yes | yes (`eval:rgc`) | yes (`examples/rgc`) | yes | yes | yes |
| TSC | yes | yes | yes (`eval:tsc`) | yes (`examples/tsc`) | yes | yes | yes |

## Bounded Migration And Handoff

1. First-time consumer setup: `docs/adoption-playbook.md`.
2. Existing consumer updates: `docs/consumer-rollout-playbook.md`.
3. Consumer overlay boundaries: `docs/repo-overlay-contract.md`.
4. Canonical validation gate after adoption or extension:
   - `npm run validate`
   - `npm run validate-neutral`
   - `npm run eval`

## Validator And Export Linkage

- Registry projection: `scripts/tools/build-neutral-core-registry.mjs`
- Provider export projection: `scripts/tools/build-provider-exports.mjs`
- Canonical/compatibility consistency checks: `scripts/tools/validate-provider-neutral-core.mjs`
- Scaffold and docs-heading checks: `scripts/tools/validate-shared-core-scaffold.mjs`
- Repo-level gate: `scripts/tools/validate-repo-surface.mjs`

## Release-Critical Audit Scope

Release-critical canonical surfaces:

- `core/contracts/*`
- `policies/*`
- `core/skills/*` with projected metadata in registry/exports
- `core/contracts/core-registry.json` and canonical provider exports under `providers/openai-codex/`, `providers/anthropic-claude/`, `providers/qwen-code/`, `providers/kimi-k2_5/`

Release-critical derived/compatibility surfaces:

- `contracts/*`
- legacy provider exports under `providers/openai/`, `providers/anthropic/`, `providers/qwen/`, `providers/kimi/`, `providers/codex/`
- `docs/tool-contracts/catalog.json`

Release rule: canonical surfaces are the source of truth; compatibility/export surfaces are audited as projections.

## Bounded Certification Handoff

At handoff time, include:

1. canonical source paths used for release/audit decisions
2. derived surfaces regenerated before handoff
3. validator/eval gate outcomes (`validate`, `validate-neutral`, `eval`)
4. remaining planned/missing surfaces that are explicitly not claimed

## Compatibility Rule

If a change only touches a compatibility surface and not its canonical source, treat it as incomplete and block merge until canonical ownership is updated or the change is rejected.

## Maturity Posture

- `prose-governed`: compatibility boundary and migration/handoff guidance in this file.
- `contract-backed`: canonical contracts in `core/contracts/*` and compatibility mirrors in `contracts/*`.
- `validator-backed`: cross-surface checks in `scripts/tools/validate-provider-neutral-core.mjs` and `scripts/tools/validate-shared-core-scaffold.mjs`.
- `runtime-implemented`: bounded to build/validation/eval scripts and generated artifacts; no runtime workflow engine, memory subsystem, or live MCP mesh is claimed.
