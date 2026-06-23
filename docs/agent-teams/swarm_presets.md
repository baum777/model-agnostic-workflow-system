---
title: Swarm Presets — 5 Default Team Compositions
page_type: derived
status: proposed
authority: derived
owner: governance
updated: 2026-06-08
tags:
  - "#governance"
  - "#swarm"
  - "#agent-teams"
  - "#presets"
  - "#proposed"
---

# Swarm Presets — 5 Default Team Compositions

This document defines 5 default **team presets** that compose the
[extended role library](./swarm_roles_extended_spec.md) on top of the
3-Agent-Core for common task shapes. Each preset is a **bounded default**
that the Orchestrator can select; the Orchestrator may always add,
remove, or substitute roles for a specific task.

> **Status:** `proposed` (not yet `canonical`).

## Selection Rule

The Orchestrator picks a preset using the **strongest matching** rule:

1. Identify the **dominant risk class** of the task
   (read-only, code-only, governance-touching, payment-touching, etc.).
2. Identify the **dominant evidence class** required
   (visual, contract, security, runtime, narrative).
3. Map to a preset. If no preset matches, default to **Fast Builder Mode**
   and add roles only when evidence demands it.

## Preset Summary

| Preset | Use when | Roles | Tier default |
| --- | --- | --- | --- |
| P1 Fast Builder Mode | Small clear tasks | Scope Governor + Builder + Test + Reviewer | Tier 2–3 |
| P2 Governed Implementation Mode | Unitera/Bevero/Architecture Planner features | Scope Governor + Architecture Planner + Builder + Governance + Reviewer + Memory Auditor | Tier 3 |
| P3 Audit / Repair Mode | Broken repos, CI bugs, drift | Scope Governor + Diagnostic + Builder + Test + Reviewer | Tier 1–3 |
| P4 Product-to-Code Mode | Business idea into software | Product Strategist + Domain Translator + Architecture Planner + Scope Governor + Builder + Reviewer | Tier 2–3 |
| P5 High-Risk Agentic Systems Mode | x402, MCP, agent tools, payments, auth | Scope Governor + Security + Governance + Architecture Planner + Reviewer + Memory Auditor + Builder (only after approval) | Tier 0–3 |

---

## Preset 1 — Fast Builder Mode

**Use for:** small clear tasks, low governance risk, no auth/DB/payment.

**Roles:**

```text
1. Scope Governor (always)
2. Builder
3. Test & Validation Agent
4. Reviewer
```

**Example tasks:** UI text fix, mobile header refactor, button routing,
typography polish, small component split, color/contrast polish.

**Tier default:** Tier 2 (Draft) for design-only work, Tier 3 (Execute +
Review) for any code change.

**Review required:** Tier 2 → optional, Tier 3 → yes.

**Output gate:** required checks from Test & Validation Agent pass;
Reviewer pass.

**Why this preset:** keeps velocity high while preserving the 3-Agent
discipline. Reviewer is non-negotiable even for "small" tasks because
the diff and policy gates still matter.

## Preset 2 — Governed Implementation Mode

**Use for:** Unitera/Bevero/Architecture Planner features, multi-module
changes, anything that touches a domain contract, migration, RBAC, or
audit.

**Roles:**

```text
1. Scope Governor
2. Architecture Planner
3. Builder
4. Governance / Policy Agent
5. Reviewer
6. Memory Auditor
```

**Example tasks:** OfferFlow review-gate slice, commit token replay
fix, audit log writer migration, RBAC role change, auth header
redesign, cross-module refactor.

**Tier default:** Tier 3 (Execute + Reviewer).

**Review required:** yes, plus governance compliance check.

**Output gate:** Architecture depth review, Governance decision, Reviewer
verdict, MSPR memory entry.

**Why this preset:** the canonical mode for Unitera and any work that
maps to the v1 Execution Boundary. Memory Auditor is mandatory because
governance changes are durable and need to remain visible to future
sessions.

## Preset 3 — Audit / Repair Mode

**Use for:** broken CI, flaky tests, regression bugs, repo drift, blocked
builds, refactor debt.

**Roles:**

```text
1. Scope Governor
2. Diagnostic Agent
3. Builder
4. Test & Validation Agent
5. Reviewer
```

**Example tasks:** CI failure, Playwright flake, typecheck drift, lockfile
break, deploy failure, secret leak, package upgrade regression.

**Tier default:** Tier 1 (Diagnostic) → Tier 3 (Builder execution).

**Review required:** yes for Builder execution; optional for Diagnostic
read-only.

**Output gate:** root cause verified (Diagnostic) + regression guard
(Test) + Reviewer verdict.

**Why this preset:** a buggy repo is not fixed by another layer of
features. Diagnose first, then minimum slice. The Diagnostic Agent is
mandatory because unverified root causes produce patch-upon-patch
debt.

## Preset 4 — Product-to-Code Mode

**Use for:** translating a business idea (gastronomie, B2B, retail,
etc.) into a software feature slice.

**Roles:**

```text
1. Product Strategist
2. Domain Translator
3. Architecture Planner
4. Scope Governor
5. Builder
6. Reviewer
```

**Example tasks:** Warenwirtschaft feature, refill workflow, shift
handover, audit dashboard, Gastronovi integration slice.

**Tier default:** Tier 2 (Discovery/Spec) → Tier 3 (Execution).

**Review required:** yes for execution; optional for product/domain
artifacts.

**Output gate:** Product Strategist output + Domain Translator output +
Architecture Planner output → Builder slice + Reviewer verdict.

**Why this preset:** the persona's core strength is exactly this
translation. The preset makes the translation **explicit** and
prevents "pretty software" that does not work in the field.

## Preset 5 — High-Risk Agentic Systems Mode

**Use for:** x402 payment intent layers, MCP tools, agent payment
systems, browser/Service Worker agents, auth integrations, secrets,
replay/binding/authorization, prompt-injection-prone surfaces.

**Roles:**

```text
1. Scope Governor
2. Security / Abuse-Case Agent
3. Governance / Policy Agent
4. Architecture Planner
5. Reviewer
6. Memory Auditor
7. Builder (only after Security + Governance approval)
```

**Example tasks:** agent payment intent, replay protection, PII
filter, approval flow, MCP tool with side effects, x402 binding.

**Tier default:** Tier 0 (Blocked) for live operations; Tier 3
(Spec/Stub) for development.

**Review required:** yes, plus human approval for any Tier 0/4 action.

**Output gate:** threat model + governance decision + architecture
review + reviewer verdict + memory entry + **explicit human approval**
before Builder activates.

**Why this preset:** high-risk agentic systems cannot be implemented
by Builder alone. The risk model must be specified and reviewed
**before** the implementation slice exists. Memory Auditor is
mandatory because high-risk decisions are durable.

---

## Mapping To Shared-Core Skills

The roles in each preset map to existing shared-core skills
([swarm_roles_extended_spec.md#cross-reference-mapped-shared-core-skills](./swarm_roles_extended_spec.md#cross-reference-mapped-shared-core-skills)).
Consumer overlays that want to **substitute** a repo-local skill for
any of these mappings must document the substitution in their overlay
contract per `docs/repo-overlay-contract.md`.

## Preset Selection Decision Tree (Advisory)

```text
Does the task touch auth, secrets, payments, MCP, or destructive ops?
├── Yes → Preset 5 (High-Risk Agentic Systems)
└── No
    Does the task start from a failure or bug?
    ├── Yes → Preset 3 (Audit / Repair)
    └── No
        Does the task start from a product/business idea?
        ├── Yes → Preset 4 (Product-to-Code)
        └── No
            Does the task touch a domain contract, RBAC, audit, or migration?
            ├── Yes → Preset 2 (Governed Implementation)
            └── No → Preset 1 (Fast Builder)
```

The decision tree is **advisory**. The Orchestrator may override based
on context. The decision and the override must be recorded in the MSPR
entry.

## Output Contracts Per Preset

Each preset produces a **handoff envelope** (MAHP-shaped) for the
handoff from the last role to the Reviewer, and from the Reviewer to
the next gate. The envelope is described in
`core/contracts/handoff-protocol.json` and is not redefined here.

Per-preset output artifacts:

| Preset | Required artifacts |
| --- | --- |
| P1 Fast Builder | diff + minimal test + reviewer verdict |
| P2 Governed | architecture-depth-review + governance decision + diff + tests + reviewer verdict + MSPR entry |
| P3 Audit/Repair | diagnostic report + regression guard + diff + reviewer verdict |
| P4 Product-to-Code | product brief + domain logic + architecture map + diff + tests + reviewer verdict |
| P5 High-Risk | threat model + governance decision + architecture map + spec/stub + reviewer verdict + memory entry + human approval evidence |

The list is the **minimum**. Real tasks may add artifacts.

## Promotion Path

`proposed` → `canonical` requires:

1. At least one preset executed end-to-end with a consumer overlay.
2. Validator-backed coverage: optional `lint-agent-role-coverage.mjs`
   script that checks a consumer overlay against the preset table.
3. Authority-matrix update for `docs/agent-teams/swarm_presets.md`.
4. Compatibility decision per `docs/compatibility.md` 0.3.0 migration
   timeline.

## Non-Goals

- Presets do **not** introduce a runtime orchestrator. The Orchestrator
  runtime is the consumer's responsibility.
- Presets do **not** replace repo-local autonomy. A consumer may
  customize any preset for their context.
- Presets do **not** claim `runtime-implemented` maturity. They are
  `prose-governed` with `contract-backed` candidates.
