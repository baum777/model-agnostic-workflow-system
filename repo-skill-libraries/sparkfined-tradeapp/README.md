# Sparkfined-Tradeapp Skill Library

This library was derived from the local `Sparkfined-Tradeapp` repo by reading the root README, `package.json`, deployment manifests, backend and API source trees, shared contracts, CI workflows, and the docs under `docs/` and `shared/docs/`.

## Branch Structure

### 1. Boundary and Contract Branch

This branch covers the canonical backend, the API shim, the frontend shell, and the additive-only shared contract surface.

### 2. Deploy and Runtime Branch

This branch covers the Railway/Vercel split, backend health, routing, and production constraints such as discover-cache scaling.

### 3. Governance and Reasoning Branch

This branch covers the Dominance Layer, reasoning prompts, LLM routing, and governance-first controls.

### 4. Domain and Delivery Branch

This branch covers journal, alerts, trading execution, and the test and delivery gates that keep the repo shippable.

## Top Starter Skills

1. `canonical-backend-boundary-review`
2. `deploy-topology-and-routing-review`
3. `shared-contract-discipline-review`
4. `reasoning-route-contract-review`
5. `testing-and-delivery-gates-review`

## Inferred Areas

- `backend/` is the canonical production service; `api/` is a compatibility surface, not the primary owner of core endpoints.
- `apps/backend-alerts/` is a separate service with its own deploy posture.
- `apps/web` is present locally, but the inspected tree only exposes a README there, so it is not treated as a primary skill branch.

## Why The Library Is Split This Way

The repo's operating model is not a single monolith. The skills need to enforce:

- backend ownership versus frontend consumption
- API shim drift prevention
- deploy target separation between Railway and Vercel
- governance and reasoning prompt discipline
- production constraints like the discover token cache rule

