---
title: Agent Role Library — Extended (3-Agent Core + 11 Specialized Roles)
page_type: derived
status: proposed
authority: derived
owner: governance
updated: 2026-06-08
tags:
  - "#governance"
  - "#swarm"
  - "#agent-teams"
  - "#roles"
  - "#proposed"
---

# Agent Role Library — Extended (3-Agent Core + 11 Specialized Roles)

This document defines the **extended** role library for the 3-Agent-Swarm
governance pattern. It is a **proposal** for shared-core portability and
composes with the 3-Agent-Core (`Orchestrator / Builder / Reviewer`) defined
in consumer-repo `ops/agent-team/swarm_roles.md` files.

> **Status:** `proposed` — not yet promoted to `canonical`. The 3-Agent-Core
> remains the minimum contract; this extended library is opt-in.
>
> **Maturity:** `prose-governed` + `contract-backed` candidate.
>
> **Boundary rule (per `docs/repo-overlay-contract.md`):** consumer repos
> adopt roles by reference and add repo-local mapping in their overlay; the
> shared core does not enforce role activation. Permission boundaries live in
> `core/contracts/permission-boundary.json` (PBC); handoff envelopes live in
> `core/contracts/handoff-protocol.json` (MAHP).

## Why An Extended Library

The 3-Agent-Core is **minimum sufficient** but not **always optimal**. Real
persona work spans:

- product/GTM/pitch writing (no code)
- domain translation (gastronomy, B2B workflows)
- architecture planning (multi-module, multi-repo)
- governance/policy (auth, RBAC, audit, payments)
- security/abuse-case thinking (MCP, x402, agents)
- refactor librarianship
- release captaining

These roles are **specialized agents** that the Orchestrator (Agent 1) may
activate in addition to the core `Builder` and `Reviewer`. Each role has:

- a single primary responsibility,
- a bounded output schema,
- explicit trigger conditions,
- explicit "when not to use",
- explicit "next gate" handoff.

## Composition With The 3-Agent-Core

| Layer | Role(s) | Source |
| --- | --- | --- |
| L0 — Always-on | Orchestrator / Scope Governor | `swarm_roles.md` v1 |
| L0 — Always-on (when activating) | Builder / Reviewer | `swarm_roles.md` v1 |
| L1 — Activated on demand | Specialized roles (this file) | `swarm_roles_extended.md` v1 |
| L2 — Optional auxiliary | Memory Auditor, Refactor Librarian, Release Captain | this file |

The Orchestrator owns the activation decision. The Builder may not invoke
specialized roles on its own. The Reviewer may flag missing role activation
but does not activate them itself.

## Maturity Labels

- `prose-governed`: this file and its role specs.
- `contract-backed` (planned): future `core/contracts/agent-role-catalog.json`
  carrying role identifiers, output contracts, and required PBC permissions.
- `validator-backed` (planned): a `lint-agent-role-coverage.mjs` script that
  checks repo overlays against the role catalog.
- `runtime-implemented` (deferred): no runtime role dispatcher in shared core;
  consumers are responsible for role activation in their own runtime if any.

## Activation Posture

For each role, this file declares:

- `defaultActivationMode`:
  - `modelagnostic-autonomous` (read-only, safe to auto-run)
  - `explicit-user-call-required` (write-capable, requires human approval)
  - `approval-required` (high-risk, requires review gate)

These modes mirror `core/contracts/permission-boundary.json` posture. Roles
that touch secrets, payments, destructive operations, or auth are
`approval-required` by default.

## Spec Index

See [swarm_roles_extended_spec.md](./swarm_roles_extended_spec.md) for the
full per-role spec (responsibility, output, trigger, when-not-to-use,
verboten, next gate, default activation mode).

See [swarm_presets.md](./swarm_presets.md) for the 5 default presets that
compose these roles for common task shapes.

See [swarm_presets.md#mapping-to-shared-core-skills](./swarm_presets.md#mapping-to-shared-core-skills)
for the link to existing shared-core skills (`repo-audit`, `secret-boundary-audit`,
`architecture-depth-review`, `planning-slice-builder`, `spec-to-task-breakdown`,
`readiness-check`, `test-matrix-builder`, `behavior-first-tdd`,
`incident-runbook-composer`, `diagnostic-feedback-loop`, `tradeoff-matrix-builder`).

## Relationship To Existing Shared-Core Surfaces

| Shared-core surface | Used by extended role(s) | Notes |
| --- | --- | --- |
| `core/contracts/output-contracts.json` | All roles | roles reference existing output contracts; no new contract ids in v1 |
| `core/contracts/permission-boundary.json` (PBC) | All roles with `approval-required` | roles declare PBC claim shape; runtime enforcement deferred |
| `core/contracts/handoff-protocol.json` (MAHP) | Multi-role presets | presets use MAHP envelope for emitter/receiver provenance |
| `core/contracts/workflow-memory-contract.json` (WMC) | Memory Auditor | L1 long-lived memory entries |
| `core/contracts/observability-spine.json` (OBS) | Reviewer, Security Agent | event-family mapping for `workflow.validation` and `workflow.permission` |
| `core/contracts/tool-contracts/catalog.json` | All roles with tool usage | tool intents bounded by tool capability policy |
| `policies/secret-classes.yaml` | Security Agent, Governance Agent | secret classes A/B/C/P apply to all roles |
| `policies/tool-capabilities.yaml` | All roles with tool usage | tool capability policy applies to all roles |

## Promotion Path

`proposed` → `canonical` requires:

1. Consumer-repo pilot evidence: at least one preset executed end-to-end with
   a bounded consumer overlay.
2. Validator-backed coverage: `lint-agent-role-coverage.mjs` in
   `scripts/tools/` enforcing minimum role coverage for presets.
3. Authority-matrix update: `docs/authority-matrix.md` entry for
   `docs/agent-teams/swarm_roles_extended.md` and `docs/agent-teams/swarm_presets.md`.
4. Compatibility decision: per `docs/compatibility.md` 0.3.0 migration
   timeline, this remains opt-in until at least one consumer overlay
   provides opt-in evidence.

## Non-Goals

- This library does **not** introduce a runtime role dispatcher. Roles
  are activated by the consumer's own Orchestrator runtime if any.
- This library does **not** redefine `Orchestrator / Builder / Reviewer`.
  See consumer-repo `ops/agent-team/swarm_roles.md` v1 for the core.
- This library does **not** override repo-local authority. Repos that
  need to opt out do so by simply not referencing this file.
- This library does **not** claim runtime maturity. `runtime-implemented`
  is `deferred` in the current phase.
