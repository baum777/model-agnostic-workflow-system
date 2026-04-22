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

## Compatibility Rule

If a change only touches a compatibility surface and not its canonical source, treat it as incomplete and block merge until canonical ownership is updated or the change is rejected.

## Maturity Posture

- `prose-governed`: compatibility boundary and migration/handoff guidance in this file.
- `contract-backed`: canonical contracts in `core/contracts/*` and compatibility mirrors in `contracts/*`.
- `validator-backed`: cross-surface checks in `scripts/tools/validate-provider-neutral-core.mjs` and `scripts/tools/validate-shared-core-scaffold.mjs`.
- `runtime-implemented`: bounded to build/validation/eval scripts and generated artifacts; no runtime workflow engine, memory subsystem, or live MCP mesh is claimed.
