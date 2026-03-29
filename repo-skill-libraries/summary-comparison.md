# Summary Comparison

## Operating Model Differences

`organoid_Symbionts` is an operator-gated runtime. Its skill system centers on worker orchestration, prompt and embodiment surfaces, health and metrics endpoints, and Render deployment topology. The repo is written like a fail-closed control plane: writes are approval-gated, state is runtime state, and the landing app is intentionally isolated from the worker loop.

`Sparkfined-Tradeapp` is a trading platform with a canonical Node backend and a frontend shell that consumes it through a strict HTTP boundary. Its skill system centers on boundary policing, contract drift detection, governance-first controls, deployment split management, and delivery gates across backend, API shim, shared contracts, and frontend.

## Architectural Priorities

`organoid_Symbionts` prioritizes:

- worker liveness
- safe outbound write behavior
- prompt/lore canonicality
- health/readiness visibility
- Render service separation

`Sparkfined-Tradeapp` prioritizes:

- canonical backend ownership
- additive-only shared contracts
- governance-first reasoning and dominance controls
- deploy routing discipline
- production scaling constraints

## Skill System Differences

The organoid library has a dedicated Render branch because the repo exposes a worker service, a health web service, a separate landing app, and a cron service in `render.yaml`. That topology needs its own review path before any other skill can be trusted.

The Sparkfined library does not need a Render branch. Its primary split is canonical backend versus API shim versus frontend shell, with deployment ownership split between Railway and Vercel. The important failure mode is drift across boundaries, not a multi-service Render blueprint.

## Structurally Similar Skills

Both repos need skills for:

- deployment readiness
- health and monitoring
- contract drift detection
- test and verification gates
- LLM or reasoning prompt governance

Those concepts are kept separate anyway because the repo-specific failure modes differ:

- organoid skills are fail-closed and runtime-centric
- Sparkfined skills are boundary-centric and contract-centric

## Key Inferences

- `organoid_Symbionts` likely has more symbolic prompt and lore layering than most production services, but the skills keep that layer operational rather than mystical.
- `Sparkfined-Tradeapp` includes auxiliary surfaces like `api/` and `apps/backend-alerts/`, but the canonical production backend remains `backend/`.
- `apps/web` in Sparkfined is not treated as a primary owned surface because the local copy only exposes a README in the inspected tree.

