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

Execution evidence and certification artifact contracts are defined in `core/contracts/output-contracts.json`.

`core/contracts/observability-spine.json` is the canonical provider-neutral OBS contract surface for Phase-10 extension adoption and is currently `contract-backed`; `npm run runtime:dry-run` consumes it for local Phase 1 run artifacts without making it a second source of truth.
`core/contracts/permission-boundary.json` is the canonical provider-neutral PBC claim surface and is currently `contract-backed`; `npm run runtime:dry-run` exercises a local deny-by-default Phase 1 permission gate without changing the contract.
`core/contracts/workflow-memory-contract.json` is the canonical provider-neutral WMC claim surface and is currently `contract-backed`; `npm run runtime:dry-run` requires it as an input contract, but memory storage and runtime enforcement remain deferred.
`core/contracts/handoff-protocol.json` and `core/contracts/handoff-patterns.json` are the canonical provider-neutral MAHP surfaces and are currently `contract-backed`; they define no transport, queueing, retries, or authorization engine.
MAHP is adjacent to OBS, PBC, and WMC contract surfaces only. This slice does not add runtime orchestration across those modules.
`core/contracts/resource-governor.json` is the canonical provider-neutral RGC surface and is currently `contract-backed`; it defines declarative resource and budget-override claims only, not a budget runtime engine.
`core/contracts/trigger-scheduling.json` is the canonical provider-neutral TSC surface and is currently `contract-backed`; it defines trigger/scheduling declarations only, not a scheduler runtime.
Validator-backed candidate eval slices now exist for targeted contract-rule checks (`eval:obs`, `eval:pbc`, `eval:wmc`) and remain opt-in module checks; only the local Phase 1 runtime dry-run is runtime-implemented.
`eval:mahp` is a minimal validator-backed candidate slice for core envelope-rule checks only and does not introduce runtime handoff orchestration.
`eval:rgc` and `eval:tsc` are minimal validator-backed candidate slices for deterministic contract-rule checks only and do not introduce budget or scheduler runtimes.

## Extension Snapshot

- Extension modules present and `contract-backed`: OBS, PBC, WMC, MAHP, RGC, TSC.
- Deterministic module eval slices present: `eval:obs`, `eval:pbc`, `eval:wmc`, `eval:mahp`, `eval:rgc`, `eval:tsc`.
- Module adoption posture is opt-in via `core/contracts/portable-skill-manifest.json`.
- Existing consumers are not made blocking by these module contracts or module-scoped eval slices.
- Runtime implementation is limited to the local Phase 1 dry-run artifact writer, contract loader, and deny-by-default permission gate.
- Memory storage, scheduler, handoff transport, resource governor runtime, HTTP service, MCP server, remote queue, and background daemon remain intentionally deferred.

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
- `runtime-implemented`: limited to build/validation scripts that consume and project these contracts, plus the local Phase 1 runtime dry-run and validation CLI that produce and check ignored run artifacts.
