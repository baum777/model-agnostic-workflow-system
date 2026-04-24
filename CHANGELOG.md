# Changelog

## 0.3.0 - planned

- Added contract-backed agentic workflow extension modules:
  - OBS - Observability Spine
  - PBC - Permission Boundary Contract
  - WMC - Workflow Memory Contract
  - MAHP - Multi-Agent Handoff Protocol
  - RGC - Resource Governor Contract
  - TSC - Trigger and Scheduling Contract
- Added deterministic eval slices:
  - eval:obs
  - eval:pbc
  - eval:wmc
  - eval:mahp
  - eval:rgc
  - eval:tsc
- Extended portable skill manifest with opt-in/deferred module contract declarations.
- Added examples for MAHP, RGC, and TSC where applicable.
- Preserved provider neutrality.
- Preserved existing consumer opt-in posture.
- Added migration-hardening policy for future opt-in-to-blocking transition; no blocking consumer gates in 0.3.0.
- No runtime implementation, scheduler, memory store, permission engine, transport, budget engine, or enforcement layer added.
- No breaking changes to existing consumers.

## 0.2.1 - 2026-04-09

- Added generated provider export bundles and the certification eval runner.
- Wired the neutral validator to check provider export artifacts and eval fixtures.
- Brought the package, plugin, README, and generated registry metadata back into version sync.

## 0.2.0 - 2026-04-09

- Introduced provider-neutral contracts and provider adapter scaffolds.
- Added a generated neutral core registry and provider capability matrix.
- Kept the Codex package surface as a compatibility export while the shared core evolves.

## 0.1.4 - 2026-03-29

- Parameterized runtime-policy-auditor as the second shared-with-local-inputs skill.
- Added a local runtime-policy contract validator and consumer linkage checks.
- Updated rollout docs and maintainer commands to distinguish runtime policy from live-readiness.

## 0.1.3 - 2026-03-29

- Parameterized runtime-policy-auditor as the second shared-with-local-inputs skill.
- Added a local runtime-policy contract validator and consumer linkage checks.
- Updated consumer rollout docs and maintainer commands for runtime-policy inputs.

## 0.1.2 - 2026-03-29

- Parameterized repo intake as the first shared-with-local-inputs skill.
- Added a boring local-input contract validator for consumer repos.
- Added shared-core and consumer validation updates for repo-intake inputs.

## 0.1.1 - 2026-03-29

- Added boring maintainer commands for lock refresh, consumer validation, and consumer initialization.
- Added rollout and lock-model documentation for repeatable consumer adoption.
- Added a standardized path for onboarding additional consumer repositories.

## 0.1.0 - 2026-03-29

- First standalone shared-core release.
- Mirrored the proven reusable workflow skills, templates, examples, docs, and helper scripts from the UNITERA staged core.
- Added versioned consumer linkage support for downstream repositories.
