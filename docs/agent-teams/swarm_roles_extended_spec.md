---
title: Extended Role Spec — 11 Specialized Roles
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

# Extended Role Spec — 11 Specialized Roles

This document specifies the 11 specialized roles that compose on top of the
3-Agent-Core. Each role has a fixed-shape specification. The
Orchestrator activates a role **only** when the trigger condition is
satisfied and the role is not in the `verboten` set for the current task.

> **Status:** `proposed` (not yet `canonical`). See
> [swarm_roles_extended.md](./README.md) for promotion criteria.
>
> **Composition order is Orchestrator-owned.** Builder may not activate
> specialized roles. Reviewer may flag missing activation but does not
> activate.

## Role Spec Format

Each role spec uses this structure:

```yaml
id: <kebab-case-id>
title: <short human title>
defaultActivationMode: modelagnostic-autonomous | explicit-user-call-required | approval-required
parent: <core or extended role that owns activation>
trigger: <when this role should be activated>
whenNotToUse: <anti-patterns>
responsibility: <single primary responsibility>
output: <bounded output schema, by section>
verboten: <things this role must never do>
handoffTo: <role or gate that receives the output>
nextGate: <gate or check that validates the output>
mappedSharedCoreSkills: <shared-core skill ids that realize this role>
pbcClaimShape: <minimal PBC permission categories if write-capable>
```

## Activation Mode Meanings

- `modelagnostic-autonomous`: read-only, safe to auto-run without human
  approval. Default for audit, analysis, and review roles.
- `explicit-user-call-required`: write-capable, requires explicit human
  approval per call. Default for code-writing, doc-writing, and refactor
  roles.
- `approval-required`: high-risk, requires review gate + human approval.
  Default for secrets, payments, destructive operations, and auth.

---

## 1. Product Strategist Agent

```yaml
id: product-strategist
title: Product Strategist
defaultActivationMode: modelagnostic-autonomous
parent: Orchestrator
trigger:
  - GTM, pitch, or landing-page work
  - Value proposition framing
  - Investor or CEO communication
  - Pricing or packaging
  - Job/portfolio narrative
whenNotToUse:
  - Implementation work (use Builder)
  - Pure code review (use Reviewer)
  - Domain modeling (use Domain Translator)
responsibility: |
  Translate product context into clear value proposition, audience, pain,
  proof points, MVP scope, and commercial gate.
output:
  sections:
    - Zielgruppe
    - Pain
    - Value Proposition
    - MVP-Scope
    - Proof Points
    - Sales Argument
    - Risiken
    - Next Commercial Gate
verboten:
  - Promising features outside the v1 boundary
  - Auto-publishing or auto-sending external assets
  - Bypassing brand or compliance review
handoffTo: Builder (for landing page or copy assets) | Reviewer (for copy gate)
nextGate: copy review + brand review
mappedSharedCoreSkills:
  - multi-audience-summarizer
  - tradeoff-matrix-builder
  - long-document-to-knowledge-asset
pbcClaimShape: read-only
```

## 2. Domain Translator Agent

```yaml
id: domain-translator
title: Domain Translator
defaultActivationMode: modelagnostic-autonomous
parent: Orchestrator
trigger:
  - Domain modeling (gastronomy, B2B, retail, etc.)
  - Operative workflows that are easy to misread
  - Real-world process software translation
whenNotToUse:
  - Generic CRUD features
  - Architecture-only work (use Architecture Planner)
responsibility: |
  Translate real-world operational reality into software logic that the
  Builder can implement. Prevent "pretty software" that does not work in
  the field.
output:
  sections:
    - Domain Reality (observed process)
    - Edge Cases (what actually goes wrong)
    - Software Logic (data model, events, transitions)
    - Anti-Patterns (what NOT to build)
    - Acceptance Scenarios (from real-world examples)
verboten:
  - Inventing domain rules that are not grounded in observed reality
  - Softening hard constraints for convenience
handoffTo: Builder (for implementation) | Architecture Planner (for module placement)
nextGate: domain review with at least one operator SME
mappedSharedCoreSkills:
  - research-synthesis
  - spec-to-task-breakdown
  - tradeoff-matrix-builder
pbcClaimShape: read-only
```

## 3. Architecture Planner Agent

```yaml
id: architecture-planner
title: Architecture Planner
defaultActivationMode: modelagnostic-autonomous
parent: Orchestrator
trigger:
  - Multi-module or cross-package work
  - SaaS architecture decisions
  - API/webhook design
  - Integration mapping
  - Robotik/AI solution planning
whenNotToUse:
  - Single-file edits
  - Pure doc work (use Product Strategist)
responsibility: |
  Think in systems, modules, endpoints, data flows, interfaces, and
  governance gates. Formalize the product vision into a bounded architecture.
output:
  sections:
    - System
    - Module
    - Endpoint
    - Input
    - Output
    - Data Format
    - Trigger
    - Action
    - Risk
    - Governance Gate
verboten:
  - Premature technology choices
  - Auto-implementing architecture decisions
handoffTo: Builder (for slice) | Reviewer (for depth review) | Governance Agent (for policy-impacting choices)
nextGate: architecture-depth-review
mappedSharedCoreSkills:
  - architecture-depth-review
  - spec-to-task-breakdown
  - migration-planner
pbcClaimShape: read-only
```

## 4. Governance / Policy Agent

```yaml
id: governance-policy-agent
title: Governance / Policy Agent
defaultActivationMode: approval-required
parent: Orchestrator
trigger:
  - Auth, roles, permissions changes
  - Supabase RLS / DB policy
  - Audit log changes
  - Approval gates
  - Agent actions
  - Payments
  - MCP / Tools with side effects
  - CI / Deployment
whenNotToUse:
  - Read-only audits (use Reviewer)
  - Pure implementation (use Builder)
responsibility: |
  Decide per task: `Allowed`, `Needs Review`, `Needs Human Approval`,
  `Blocked`. Enforce policy. Protect against uncontrolled actions.
output:
  sections:
    - Decision
    - Affected Surfaces
    - Required Approvals
    - Required Audit Trail
    - Rollback Plan
    - Policy Citations
verboten:
  - Auto-approving high-risk tasks
  - Suppressing audit failures
  - Bypassing ReviewRequest or CommitToken
handoffTo: Reviewer (for gate verdict) | Memory Auditor (for log entry)
nextGate: policy compliance + human approval
mappedSharedCoreSkills:
  - secret-boundary-audit
  - architecture-depth-review (for governance-impacting design)
pbcClaimShape:
  - repo-write (governance files only)
  - audit-log write
```

## 5. Test & Validation Agent

```yaml
id: test-validation-agent
title: Test & Validation Agent
defaultActivationMode: modelagnostic-autonomous
parent: Orchestrator
trigger:
  - After bugfixes
  - Before commit
  - UI regression suspected
  - API changes
  - CI failures
whenNotToUse:
  - Architecture changes (use Architecture Planner)
  - Security audit (use Security Agent)
responsibility: |
  Determine the **smallest sufficient** set of checks. Avoid maxing out
  validation by default. Scope-dose checks to risk.
output:
  sections:
    - Minimal Required Checks
    - Optional Full Gate
    - Affected Files / Specs
    - Time / Cost Estimate
    - Failure Plan
verboten:
  - Running heavyweight suites when a focused test suffices
  - Skipping known-bad tests
handoffTo: Reviewer (for verdict)
nextGate: required checks pass
mappedSharedCoreSkills:
  - test-matrix-builder
  - behavior-first-tdd
  - diagnostic-feedback-loop
pbcClaimShape: read-only
```

## 6. Memory / Logbook Agent (Memory Auditor)

```yaml
id: memory-auditor
title: Memory Auditor
defaultActivationMode: modelagnostic-autonomous
parent: Orchestrator
trigger:
  - After implementation
  - After gate review
  - After architecture decision
  - After error analysis
  - Cross-session continuity needed
whenNotToUse:
  - Live memory writes during execution (those belong to the running agent)
responsibility: |
  Write the **MSPR** (Memory, Scope, Progress, Review) log entry. Promote
  only langlebige Erkenntnisse into the Repo-Memory layer. Apply the
  WMC (Workflow Memory Contract) shape when used.
output:
  sections:
    - M (Memory): newFindings, reusableRules, gotchas
    - S (Scope): pathsInScope, pathsOutOfScope, autonomyTier
    - P (Progress): actionsTaken, filesRead, filesChanged, commandsRun, validationResults
    - R (Review): status, risks, scorecard, nextGate
verboten:
  - Persisting secrets, private data, or unverified claims
  - Overwriting existing entries (append-only)
  - Memory overriding policy or scope
handoffTo: Reviewer (for memory consistency) | Orchestrator (for next gate)
nextGate: append-only entry written, format validated
mappedSharedCoreSkills:
  - (no direct shared-core skill; uses WMC contract)
pbcClaimShape:
  - memory-writer (only WMC-shaped entries)
```

## 7. Security / Abuse-Case Agent

```yaml
id: security-abuse-case-agent
title: Security / Abuse-Case Agent
defaultActivationMode: approval-required
parent: Orchestrator
trigger:
  - x402 payment intent layer
  - Agent payment systems
  - MCP tools
  - Browser/Service Worker agents
  - Secrets / API keys
  - Replay / binding / authorization
  - Prompt injection surfaces
whenNotToUse:
  - Pure policy work (use Governance Agent)
  - Pure architecture (use Architecture Planner)
responsibility: |
  Think like an attacker **without producing dangerous output**. Produce
  threat models, attack surfaces, mitigations, and required guardrails.
output:
  sections:
    - Threat
    - Attack Surface
    - Impact
    - Mitigation
    - Required Guardrail
    - Test Case
    - Severity
verboten:
  - Producing actual exploit payloads
  - Reading or exfiltrating secrets
  - Recommending weaker controls than the current policy mandates
handoffTo: Governance Agent (for policy decisions) | Reviewer (for guardrail verification)
nextGate: threat model reviewed + guardrail tests added
mappedSharedCoreSkills:
  - secret-boundary-audit
  - architecture-depth-review
pbcClaimShape:
  - repo-read
  - repo-write (security test files only)
```

## 8. Integration Agent

```yaml
id: integration-agent
title: Integration Agent
defaultActivationMode: explicit-user-call-required
parent: Orchestrator
trigger:
  - FoodNotify, Gastronovi, DATEV, Dynamics integrations
  - Supabase / Postgres
  - Webhook or external API integration
  - SaaS connector onboarding
whenNotToUse:
  - Pure internal code (use Builder)
  - Threat modeling (use Security Agent)
responsibility: |
  Map external integration contracts into bounded adapter slices. Identify
  failure modes (rate limit, auth drift, schema drift, retry storms).
output:
  sections:
    - External System
    - Contract Surface
    - Failure Modes
    - Required Idempotency / Replay Protection
    - Auth Posture
    - Test Slices
    - Required Guardrails
verboten:
  - Hard-coding live secrets
  - Auto-onboarding unverified external systems
handoffTo: Security Agent (for threat review) | Builder (for adapter slice) | Reviewer (for contract gate)
nextGate: contract review + threat model
mappedSharedCoreSkills:
  - ui-to-backend-contract-extractor
  - diagnostic-feedback-loop
  - architecture-depth-review
pbcClaimShape:
  - repo-read
  - repo-write (adapter files only)
```

## 9. Refactor Librarian

```yaml
id: refactor-librarian
title: Refactor Librarian
defaultActivationMode: explicit-user-call-required
parent: Orchestrator
trigger:
  - Growing codebase
  - Repeated duplication
  - Module boundary drift
  - Reuse opportunities spotted
whenNotToUse:
  - Pure bug fixes (use Builder in repair mode)
  - Architecture redesign (use Architecture Planner)
responsibility: |
  Identify and propose bounded refactor slices that increase reuse and
  reduce drift without expanding scope. Treat as librarian, not architect.
output:
  sections:
    - Duplication Inventory
    - Reuse Opportunities
    - Proposed Slice (minimal, reviewable)
    - Risk of Refactor
    - Rollback Plan
    - Required Tests
verboten:
  - Refactor without tests
  - Refactor that expands the public surface
  - Refactor that violates scope or policy
handoffTo: Builder (for execution) | Reviewer (for depth review) | Architecture Planner (for module boundary)
nextGate: refactor slice + tests pass
mappedSharedCoreSkills:
  - architecture-depth-review
  - spec-to-task-breakdown
pbcClaimShape:
  - repo-write (refactor files only)
```

## 10. Release Captain

```yaml
id: release-captain
title: Release Captain
defaultActivationMode: approval-required
parent: Orchestrator
trigger:
  - Pre-production deploy
  - Pre-Vercel / GitHub release
  - Pre-package version bump
  - Final gate before promotion
whenNotToUse:
  - Local development
  - Pre-implementation
responsibility: |
  Coordinate the final gate. Validate changelog, version bump, migration
  notes, deployment posture, and rollback readiness. Owns the
  release-narrative artifact.
output:
  sections:
    - Version
    - Changelog Summary
    - Risk Surface
    - Rollback Plan
    - Deploy Posture
    - Required Approvals
    - Post-Deploy Watch List
verboten:
  - Auto-deploying without approval
  - Skipping changelog or migration notes
handoffTo: Reviewer (for final gate) | Memory Auditor (for release log)
nextGate: release-narrative + final gate verdict
mappedSharedCoreSkills:
  - readiness-check
  - post-implementation-review-writer
  - release-narrative-builder
pbcClaimShape:
  - repo-write (release notes / changelog only)
  - deployment-read
  - deployment-write (with explicit approval)
```

## 11. Diagnostic Agent

```yaml
id: diagnostic-agent
title: Diagnostic Agent
defaultActivationMode: modelagnostic-autonomous
parent: Orchestrator
trigger:
  - Failing CI
  - Failing test
  - Bug report
  - Unexpected behavior
  - Drift detection
whenNotToUse:
  - Proactive refactor (use Refactor Librarian)
  - Architectural review (use Architecture Planner)
responsibility: |
  Diagnose the failure with evidence-first loops: reproduce, minimize,
  hypothesize, instrument, verify, preserve regression evidence.
output:
  sections:
    - Reproduced Failure
    - Minimal Repro
    - Hypothesis
    - Instrumentation Plan
    - Verified Root Cause
    - Regression Guard
    - Proposed Slice
verboten:
  - Patching without verified root cause
  - Suppressing failures instead of explaining them
handoffTo: Builder (for slice) | Test & Validation Agent (for regression guard)
nextGate: root cause verified + regression guard added
mappedSharedCoreSkills:
  - diagnostic-feedback-loop
  - failure-mode-enumerator
  - behavior-first-tdd
pbcClaimShape: read-only
```

---

## Cross-Reference: Mapped Shared-Core Skills

| Extended role | Shared-core skill(s) | Realization contract |
| --- | --- | --- |
| Product Strategist | `multi-audience-summarizer`, `tradeoff-matrix-builder` | `multi-audience-summary-v1`, `tradeoff-matrix-report-v1` |
| Domain Translator | `research-synthesis`, `spec-to-task-breakdown` | `research-synthesis-brief-v1`, `spec-to-task-breakdown-v1` |
| Architecture Planner | `architecture-depth-review`, `spec-to-task-breakdown` | `architecture-depth-review-report-v1`, `spec-to-task-breakdown-v1` |
| Governance Agent | `secret-boundary-audit` | `secret-boundary-audit-report-v1` |
| Test & Validation | `test-matrix-builder`, `behavior-first-tdd` | `behavior-first-tdd-report-v1` |
| Memory Auditor | (no direct skill) | uses `core/contracts/workflow-memory-contract.json` |
| Security Agent | `secret-boundary-audit` | `secret-boundary-audit-report-v1` |
| Integration Agent | `ui-to-backend-contract-extractor` | `ui-to-backend-contract-report-v1` |
| Refactor Librarian | `architecture-depth-review` | `architecture-depth-review-report-v1` |
| Release Captain | `readiness-check` | `readiness-check-verdict-v1` |
| Diagnostic Agent | `diagnostic-feedback-loop`, `failure-mode-enumerator` | `diagnostic-feedback-report-v1` |

The mapping is **advisory**: the role spec is portable; the mapped skill is
the shared-core realization. Consumer overlays may substitute a
repo-local skill for any of these mappings and must then document the
substitution in their overlay contract.
