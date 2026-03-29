# organoid_Symbionts Skill Tree

## Render Deploy Branch

- `render-blueprint-review` - reviews the Render service graph, commands, and service split
- `render-env-contract-validation` - validates env vars against the runtime and Render blueprint
- `render-topology-and-separation-review` - checks worker, health, landing, and cron separation
- `render-readiness-and-rollback` - checks deploy readiness, runbook coverage, and rollback posture

## Runtime Control Branch

- `worker-loop-operability-review` - reviews the poller loop, launch gates, and worker entrypoint
- `fail-closed-write-policy-review` - reviews approval-gated writes, public guards, and safety gates
- `health-and-metrics-review` - reviews health endpoints, glyph surfaces, and Prometheus-style metrics
- `state-store-and-migration-review` - reviews state store contracts and migration discipline

## Prompt, Embodiment, and Signal Branch

- `prompt-canon-and-embodiment-review` - reviews prompt assets, embodiment fragments, and lore canon
- `timeline-engagement-policy-review` - reviews timeline engagement thresholds and candidate policy
- `external-signal-and-verification-review` - reviews market/onchain read paths and trust boundaries

## Validation and Derived Artifacts Branch

- `testing-and-compliance-gates-review` - reviews CI, simulation, and operator-facing validation gates
- `semantic-regeneration-review` - reviews semantic index rebuilds and snippet extraction artifacts

