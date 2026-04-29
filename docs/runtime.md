# Runtime

Class: operational.
Use rule: use this as the local Phase 1 runtime command guide; canonical contract truth remains in `core/contracts/*` and claim status remains in `docs/authority-matrix.md`.

## Scope

The Phase 1 runtime is local-only and artifact-oriented.

It can:

- load required contracts from `core/contracts/*`
- create a runtime run ID
- write local run artifacts under `artifacts/runtime-runs/<runId>/`
- write OBS-style events
- exercise a deny-by-default permission gate
- write controlled runtime-scoped memory entries to local JSONL
- validate Phase 1 run artifacts

It does not implement:

- scheduler runtime
- handoff transport
- resource governor runtime
- HTTP service
- MCP server
- remote queue
- background daemon
- autonomous agent loop
- automatic canonical promotion
- SQLite storage
- remote memory

## Commands

```bash
npm run runtime:dry-run
```

Creates a local Phase 1 runtime run.

```bash
npm run runtime:validate -- --latest
```

Validates the latest local Phase 1 runtime run artifact.

```bash
npm run runtime:validate -- --runId <runId>
```

Validates a specific local Phase 1 runtime run artifact.

```bash
npm run runtime:replay -- --runId <runId>
```

Replays a specific local runtime run by reading `manifest.json`, `events.jsonl`, `permissions.jsonl`, `memory.jsonl`, and `validation-receipt.json`.

```bash
npm run runtime:replay -- --latest
```

Replays the latest valid local runtime run. Latest-run resolution ignores malformed run directories and orders valid runs by manifest `createdAt`.

```bash
npm run memory:validate
```

Validates the Phase 2 memory skeleton. This checks structure, schemas, policy markers, and disabled-capability posture only.

The following commands intentionally fail closed in Phase 1:

```bash
npm run runtime:run
npm run runtime:status
```

## Artifact Contract

Each dry-run creates:

```text
artifacts/runtime-runs/<runId>/
  manifest.json
  events.jsonl
  permissions.jsonl
  memory.jsonl
  validation-receipt.json
```

`artifacts/runtime-runs/<runId>/` is ignored local evidence. Only `artifacts/runtime-runs/.gitkeep` is tracked.

Controlled runtime memory writes also append to:

```text
memory/stores/jsonl/runtime-memory.jsonl
```

That file is ignored local evidence. It is not canonical truth.

## Authority Boundary

Runtime consumes contracts; it does not promote, rewrite, or replace them.

Required Phase 1 contract inputs:

- `core/contracts/workflow-routing-map.json`
- `core/contracts/permission-boundary.json`
- `core/contracts/workflow-memory-contract.json`
- `core/contracts/observability-spine.json`

If a required contract is missing or invalid JSON, the runtime blocks.

## Validation

Phase 1 validation is limited to local run artifact consistency:

- `manifest.json` exists and matches the run directory
- `events.jsonl` contains at least one event
- `permissions.jsonl` contains a denied `external.http` decision
- `validation-receipt.json` has `result: "pass"`
- `validation-receipt.json` includes versioned summary metadata
- latest-run resolution uses valid manifest `createdAt`, not directory mtime alone

Phase 2 memory validation is limited to skeleton consistency:

- required `memory/` docs, scopes, policies, and schemas exist
- schema files parse as JSON and declare required fields
- policies preserve secret exclusion, known scopes, and review-only promotion
- runtime memory writes are enabled only for controlled `runtime` scope
- canonical promotion, SQLite, and scheduler remain disabled

Phase 3 memory write validation is limited to:

- memory entries use `runtime` scope
- provenance points to `artifacts/runtime-runs/<runId>/validation-receipt.json`
- secret-like content is blocked before write
- unknown or non-runtime scope is blocked
- promotion status remains `none`

Phase 4 replay reads artifacts only. It does not re-execute runtime actions.

Use the repo-wide gates for shared-core integrity:

```bash
npm run validate
npm run eval:obs
npm run eval:pbc
npm run eval:wmc
```
