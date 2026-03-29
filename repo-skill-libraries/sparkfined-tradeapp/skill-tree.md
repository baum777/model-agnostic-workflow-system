# Sparkfined-Tradeapp Skill Tree

## Boundary and Contract Branch

- `canonical-backend-boundary-review` - reviews the backend as the canonical owner of server behavior
- `api-vs-backend-drift-review` - reviews Vercel API shim drift and production blocking rules
- `shared-contract-discipline-review` - reviews additive-only shared contracts and contract drift

## Deploy and Runtime Branch

- `deploy-topology-and-routing-review` - reviews Railway, Vercel, and route ownership
- `production-constraint-and-scaling-review` - reviews cache, single-instance, and launch constraints

## Governance and Reasoning Branch

- `dominance-policy-review` - reviews Dominance Layer policy, approval gates, and risk tiers
- `reasoning-route-contract-review` - reviews reasoning prompts, schemas, and API contracts
- `llm-router-and-provider-governance-review` - reviews provider routing and prompt output discipline

## Domain and Delivery Branch

- `journal-state-machine-review` - reviews journal state, archive, confirm, and restore flows
- `alerts-and-webhook-flow-review` - reviews alerts, webhooks, SSE, and push flows
- `trading-execution-safety-review` - reviews quote, swap, and wallet-facing safety boundaries
- `testing-and-delivery-gates-review` - reviews CI, PR checks, and release gates

