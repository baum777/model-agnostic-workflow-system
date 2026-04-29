# Runtime

Class: operational.
Use rule: use this as the local runtime command guide; canonical contract truth remains in `core/contracts/*` and claim status remains in `docs/authority-matrix.md`.

## Scope

The runtime is local-only and artifact-oriented.

It can:

- load required contracts from `core/contracts/*`
- create a runtime run ID
- write local run artifacts under `artifacts/runtime-runs/<runId>/`
- write OBS-style events
- exercise a deny-by-default permission gate
- write controlled runtime-scoped memory entries to local JSONL
- write a local handoff envelope
- evaluate timeout, budget, and cancellation resource checks
- write an explicit local manual trigger artifact
- validate cron trigger configuration without starting a scheduler
- validate local run artifacts

It does not implement:

- scheduler daemon
- auto-start scheduling
- background scheduler jobs
- handoff transport
- HTTP service
- MCP server
- remote transport
- remote queue
- background daemon
- autonomous agent loop
- automatic canonical promotion
- SQLite storage
- remote memory
- autonomous scheduler loop

## Commands

```bash
npm run runtime:dry-run
```

Creates a local runtime dry-run.

```bash
npm run runtime:validate -- --latest
```

Validates the latest local runtime run artifact.

```bash
npm run runtime:validate -- --runId <runId>
```

Validates a specific local runtime run artifact.

```bash
npm run runtime:replay -- --runId <runId>
```

Replays a specific local runtime run by reading `manifest.json`, `events.jsonl`, `permissions.jsonl`, `memory.jsonl`, and `validation-receipt.json`.

```bash
npm run runtime:replay -- --latest
```

Replays the latest valid local runtime run. Latest-run resolution ignores malformed run directories and orders valid runs by manifest `createdAt`.

```bash
npm run runtime:scheduler -- --validate-cron --expression "0 9 * * 1" --timezone UTC
```

Validates a cron trigger declaration shape locally. This command does not start a cron runner, daemon, HTTP/MCP surface, queue consumer, or background job.

```bash
npm run runtime:scheduler -- --daemon
```

Fails closed. Phase 6 has no scheduler daemon.

```bash
npm run runtime:service
```

Fails closed. Phase 7 service-mode readiness requires an explicit `--enable-service-mode` flag and still does not start a listener.

```bash
npm run runtime:service -- --enable-service-mode --http --mcp
```

Fails closed. HTTP and MCP service transports remain deferred until a local auth/permission model is implemented and validated.

```bash
npm run runtime:service -- --preflight --identity local-user
```

Runs Phase 8 local service auth/permission preflight. This may return `preflightChecksPassed: true`, but must still report `serviceStartAllowed: false`.

```bash
npm run runtime:service -- --simulate-action run --identity local-user
```

Simulates a Phase 9 service-capable action locally. The action must have an explicit identity-bound claim and still does not start a listener.

```bash
npm run memory:validate
```

Validates the Phase 2 memory skeleton. This checks structure, schemas, policy markers, and disabled-capability posture only.

The following commands intentionally fail closed in the current local runtime slice:

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
  handoff-envelope.json
  resources.json
  trigger.json
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

Required runtime contract inputs:

- `core/contracts/workflow-routing-map.json`
- `core/contracts/permission-boundary.json`
- `core/contracts/workflow-memory-contract.json`
- `core/contracts/observability-spine.json`

If a required contract is missing or invalid JSON, the runtime blocks.

## Validation

Runtime validation is limited to local run artifact consistency:

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

Phase 5 handoff and resource validation is limited to local artifacts:

- `handoff-envelope.json` follows the local MAHP envelope shape and points to the run ID
- `resources.json` records timeout, budget, and cancellation checks
- cancellation uses a local `CANCEL` marker file in the active run directory
- no scheduler, queue, service mode, or remote handoff transport exists

Phase 6 scheduler validation is limited to explicit local evidence:

- `trigger.json` records a manual trigger for the active run
- manual triggers have `autoStart: false`, `backgroundJobs: false`, and `httpMcp: false`
- cron validation accepts or blocks declaration shape only
- no cron runner, daemon, HTTP/MCP surface, queue consumer, file watcher, threshold monitor, or background job is started

Phase 7 service-mode readiness is a specification gate, not a service runtime:

- service start is blocked without an explicit `--enable-service-mode` flag
- HTTP and MCP service transports remain deferred behind local auth and permission model readiness
- remote transport remains blocked before local auth/permission model readiness
- no HTTP listener, MCP server, remote transport, background service, or daemon is started

Phase 8 local service auth/permission preflight proves local control checks without opening a service surface:

- identity is required and must come from a controlled local source: CLI flag, environment, or fixture
- allowed identities are bounded to `local-user`, `ci`, and `agent`
- service preflight is bound through `identity + scope + action + target`
- unbound actions and implicit trust sources are blocked
- successful preflight returns `preflightChecksPassed: true` and `serviceStartAllowed: false`
- `--http`, `--mcp`, `--remote`, and `--daemon` remain blocked during preflight

Phase 9 service execution contract defines local-only service-capable actions without opening a service surface:

- `run`, `status`, `replay`, and `cancel` are service-capable actions
- every action requires a controlled identity and an explicit `service:<action>` claim
- claim binding is evaluated with `identity + scope + action + target`
- action-level permission coverage must include all service-capable actions
- simulated execution uses `transport: local-only`
- successful simulation returns `listenerStarted: false`, `httpMcpStarted: false`, and `serviceStartAllowed: false`

Use the repo-wide gates for shared-core integrity:

```bash
npm run validate
npm run eval:obs
npm run eval:pbc
npm run eval:wmc
```
