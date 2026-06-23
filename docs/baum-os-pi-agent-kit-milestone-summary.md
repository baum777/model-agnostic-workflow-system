# Baum-OS / Pi-Agent-Kit Milestone Summary

## Class

milestone-summary / docs-only / governance evidence

## Status

completed milestone — no runtime expansion

## Milestone

```text
First complete Baum-OS / Pi-Agent-Kit Tier-1 governance loop completed.
```

## Final Result

- Pi (`@earendil-works/pi-coding-agent@0.79.9`) is anchored as an Execution Surface / CLI-Agent-Runner. It is not an LLM provider. `providers/pi/` is permanently forbidden.
- Runtime Surface `runtime/surfaces/pi/` exists as a docs-only policy skeleton. No runtime activation in any slice.
- Sandbox Policy (`docs/pi-harness-sandbox-working-plan.md`) is accepted. Zone model S0–S4, network boundary NET_0–NET_3, and evidence contract are active.
- Vault Boundary is read-only by default. No automatic write. Write requires owner-scoped separate slice.
- Skill Contract Schema (17 required fields) is accepted. Every Pi-runnable skill must declare its full execution boundary.
- Tier-1 Draft Session Design is accepted. Skill contract `pi-tier1-docs-draft-proposal` is the first approved boundary.
- First Pi Tier-1 Draft Session was executed (`minimax/MiniMax-M3`, `--no-session --print`, exit 0, no tools invoked).
- Generated proposal was reviewed and cleared all 11 criteria.
- Proposal was promoted to canonical docs as `docs/pi-tier-1-draft-workflow.md` via owner-approved promotion slice.

## Architecture Decisions

| Decision | Result |
|----------|--------|
| Pi role | Execution Surface / CLI-Agent-Runner |
| Pi provider status | not a provider |
| Provider default | minimax/MiniMax-M3 |
| Runtime surface | docs-only skeleton |
| Sandbox policy | accepted |
| Vault mode | read-only by default |
| Skill schema | accepted (17 required fields) |
| Tier-1 mode | draft_only |
| Evidence location | `sandbox/runs/<timestamp>/` |
| Promotion model | owner-approved separate slice |

## Key Commits

```text
bdcc4b5 — Pi smoke evidence: MiniMax-M3 PI_SMOKE_OK, P-04 verified
43b68b5 — sandbox policy accepted
880a3d4 — runtime surface skeleton (runtime/surfaces/pi/)
bd4ff8c — vault boundary decision
9801521 — skill contract schema accepted (17 fields)
490c592 — tier-1 draft design accepted
1506d43 — sandbox run evidence bootstrap
c1e05e2 — draft target directories bootstrap (drafts/, docs/proposals/)
663e913 — first Pi Tier-1 draft run
396f41b — post-run governance reconciliation
caa278f — proposal review (promotable)
fbfc346 — promotion decision (promote → docs/pi-tier-1-draft-workflow.md)
7e17c5a — canonical promotion
```

## Completed Governance Chain

```text
Run → Reconciliation → Review → Decision → Promotion
663e913 → 396f41b → caa278f → fbfc346 → 7e17c5a
```

## Evidence

| Evidence Artifact | Location |
|-------------------|----------|
| Smoke Evidence | `docs/pi-smoke-run-evidence.md` (MiniMax-M3, commit `bdcc4b5`) |
| First Tier-1 Run Evidence | `sandbox/runs/20260623T225209Z/` (8 artifacts, all pass) |
| Promotion Evidence | `sandbox/runs/20260623T230640Z/` (8 artifacts, all pass) |
| Canonical Output | `docs/pi-tier-1-draft-workflow.md` |

## Boundaries Still Active

```text
No providers/pi/
No runtime code
No automatic Vault write
No unapproved Pi execution
No open-ended sessions
No secrets
No .env reads
No automatic promotion from draft to canonical
```

## What This Proves

```text
The harness can move a Pi-generated draft through evidence, review, decision and
canonical promotion without granting Pi uncontrolled repo/runtime authority.
```

Each step required explicit approval, produced evidence, and was committed separately. No step escalated permissions beyond its stated tier. The governance loop is closed.

## Remaining Optional Next Gates

| Next Gate | Purpose |
|-----------|---------|
| Pi Tier-1 Draft Workflow Content Expansion Slice | canonical workflow konkretisieren |
| General Tier-1 Tool Suppression Policy Slice | `--no-tools` allgemeiner verankern |
| Second Tier-1 Skill Design | nächsten Skill definieren |
| Runtime Surface Handoff Consistency Slice | Handoff/Evidence weiter harmonisieren |
| Vault Read Bridge Design Slice | read-only Memory Bridge später vorbereiten |

## Recommended Next Step

```text
Pi Tier-1 Draft Workflow Content Expansion Slice
```

The canonical workflow (`docs/pi-tier-1-draft-workflow.md`) exists but is intentionally minimal. The next useful step is to expand it with concrete operator steps while preserving the no-runtime/no-provider/no-vault-write boundaries.
