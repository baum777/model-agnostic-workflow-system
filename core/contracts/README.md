# Core Contracts

Canonical machine-readable contracts for the portable slice.

## Canonical Files

- `core/contracts/portable-skill-manifest.json`
- `core/contracts/output-contracts.json`
- `core/contracts/tool-contracts/catalog.json`
- `core/contracts/provider-capabilities.json`
- `core/contracts/core-registry.json`
- `core/contracts/workflow-routing-map.json`
- `core/contracts/observability-spine.json`
- `core/contracts/permission-boundary.json`
- `core/contracts/workflow-memory-contract.json`
- `core/contracts/handoff-protocol.json`
- `core/contracts/handoff-patterns.json`
- `core/contracts/resource-governor.json`
- `core/contracts/trigger-scheduling.json`
- `core/contracts/skill-frontdoor-admission.schema.json`

Execution evidence and certification artifact contracts are defined in `core/contracts/output-contracts.json`.

`core/contracts/skill-frontdoor-admission.schema.json` is the canonical machine-readable admission record for skill candidates. It binds mandatory SkillSpector static evidence and SkillEvaluator Tier 1 evidence to a MAWS-owned fail-closed disposition before implementation/install while explicitly keeping analyzer PASS separate from authority.

## Tool Catalog And Registry Authority

- `core/contracts/tool-contracts/catalog.json` is the canonical machine-readable tool catalog for portable tool contracts, side effects, approval posture, provider support, and secret-boundary metadata.
- `core/contracts/core-registry.json` is the validator-backed neutral registry snapshot generated from canonical inputs. It aggregates skill, workflow, tool, provider, and compatibility metadata for discovery and export.
- `docs/tool-contracts/catalog.json` is a compatibility/export surface for the current Codex-oriented tool catalog. It may carry runnable/helper status for consumer-facing documentation, but it is not a second canonical tool catalog.
- `providers/<provider>/export.json` files are generated projections of the registry and provider capability contracts. They are provider packaging artifacts, not independent semantic authority.

`core/contracts/observability-spine.json` is the canonical provider-neutral OBS contract surface for Phase-10 extension adoption and is currently `contract-backed`; `npm run runtime:dry-run` consumes it for local Phase 1 run artifacts without making it a second source of truth.
`core/contracts/permission-boundary.json` is the canonical provider-neutral PBC claim surface and is currently `contract-backed`; `npm run runtime:dry-run` exercises a local deny-by-default Phase 1 permission gate without changing the contract.
`core/contracts/workflow-memory-contract.json` is the canonical provider-neutral WMC claim surface and is currently `contract-backed`; `npm run runtime:dry-run` requires it as an input contract and can write controlled local run-scoped JSONL memory artifacts, but remote memory, promotion, and broad runtime enforcement remain deferred.
`core/contracts/handoff-protocol.json` and `core/contracts/handoff-patterns.json` are the canonical provider-neutral MAHP surfaces and are currently `contract-backed`; they define no transport, queueing, retries, or authorization engine.
MAHP is adjacent to OBS, PBC, and WMC contract surfaces only. This slice does not add runtime orchestration across those modules.
`core/contracts/resource-governor.json` is the canonical provider-neutral RGC surface and is currently `contract-backed`; it defines declarative resource and budget-override claims only, not a budget runtime engine.
`core/contracts/trigger-scheduling.json` is the canonical provider-neutral TSC surface and is currently `contract-backed`; it defines trigger/scheduling declarations only, not a scheduler runtime.
Validator-backed candidate eval slices now exist for targeted contract-rule checks (`eval:obs`, `eval:pbc`, `eval:wmc`, `eval:mahp`, `eval:rgc`, `eval:tsc`) and remain opt-in module checks.
Runtime implementation is bounded to local run artifacts and validators recorded in `docs/authority-matrix.md`; it does not introduce scheduler daemon, HTTP/MCP listener, handoff transport, remote queue, remote memory, or broad service runtime authority.

## Extension Snapshot

- Extension modules present and `contract-backed`: OBS, PBC, WMC, MAHP, RGC, TSC.
- Deterministic module eval slices present: `eval:obs`, `eval:pbc`, `eval:wmc`, `eval:mahp`, `eval:rgc`, `eval:tsc`.
- Module adoption posture is opt-in via `core/contracts/portable-skill-manifest.json`.
- Existing consumers are not made blocking by these module contracts or module-scoped eval slices.
- Runtime implementation is limited to local run-artifact creation and validation surfaces: dry-run artifact writing, contract loading, deny-by-default permission checks, controlled local JSONL memory writes, local handoff envelope artifacts, local resource checks, manual trigger artifacts, cron declaration validation, and local service action/request receipts.
- Scheduler daemon, auto-start jobs, handoff transport/receiver, HTTP service, MCP server, remote queue, SQLite/remote memory, and background daemon remain intentionally deferred.

## Safe Extension Flow

1. Update canonical contract(s) in this folder first.
2. Regenerate derived artifacts with `npm run build-registry` and, when needed, `npm run build-exports`.
3. Validate with `npm run validate`, `npm run validate-neutral`, and `npm run eval`.
4. Only then update operational docs/templates/examples that reference changed fields.

## Compatibility Rule

- top-level `contracts/core-registry.json` and `contracts/provider-capabilities.json` are compatibility mirrors while migration is underway.
- `docs/tool-contracts/catalog.json` remains compatibility/export for the legacy tool catalog view.
- compatibility/export mirrors must not introduce canonical-only semantics absent from `core/contracts/*`.

## Maturity Posture

- `prose-governed`: this index and extension guidance.
- `contract-backed`: JSON contracts in this directory.
- `validator-backed`: `scripts/tools/validate-provider-neutral-core.mjs` and `scripts/tools/validate-shared-core-scaffold.mjs`.
- `runtime-implemented`: limited to build/validation scripts that consume and project these contracts, plus bounded local runtime CLIs and helpers that produce, replay, or check ignored run artifacts. This does not imply a live MCP server, HTTP listener, scheduler daemon, remote transport, or production service.
