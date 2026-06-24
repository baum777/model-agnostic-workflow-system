# Pi Runtime Surface

> v0.2-pre-runtime · docs-only · no runtime implementation

## Class

runtime surface / docs-only / execution-surface governance

## Status

v0.2-pre-runtime closed — all four surfaces expanded and validated.
Closure review: `docs/pi-runtime-surface-closure-review.md` (commit `44353e8`)

## Purpose

Pi is a local Execution Surface / CLI-Agent Runner for Baum-OS governed work.

Pi is **not** an LLM provider. `providers/pi/` is permanently forbidden.
Pi routes to external providers as its own backends (default: `minimax / MiniMax-M3`).
Its role in Baum-OS is as a bounded execution shell, not a provider adapter.

## Tier System

| Tier | Session Type | Description |
|------|-------------|-------------|
| Tier 0 | `read_only_review` | Read context, list models, produce analysis in `--print` mode; no file writes |
| Tier 1 | `draft_only_generation` | Bounded Markdown drafts; `--no-tools --print` only; output to approved path |
| Tier 2+ | `approved_execution` | File edits, bash, mutating operations; requires explicit owner approval per slice |

Pi sessions default to **Tier 0** unless explicitly elevated by an owner-approved slice.
No agent may self-escalate beyond Tier 1 without a new owner-approved execution slice.

Authority: `session-policy.md`

## Surface Inventory

| File | Purpose | Status |
|------|---------|--------|
| `session-policy.md` | Session types, tier mapping, pre-conditions, abort conditions, vault boundary, authority chain | expanded `611ae3a` |
| `evidence-contract.md` | Canonical run path, 8-artifact structure, diff rule, audit rule, boundary rule, human approval | expanded `84116f8` |
| `smoke-command.md` | Smoke command purpose, Tier 0/1 boundary, approved command shape, abort conditions, evidence requirement | expanded `0e6b579` |
| `handoff.md` | Handoff format, canonical path, 8-artifact list, audit/re-audit rule, non-promotion statement, boundary rules | expanded `3a954c8` |

## Evidence Path

Every Pi run must produce evidence under:

```
sandbox/runs/<timestamp>/
```

Canonical 8-artifact structure defined in `docs/evidence-path-contract.md`.
Pi-session-specific rules defined in `evidence-contract.md`.

## Boundary Summary

```
No Pi session without explicit Owner Approval
No provider call outside approved execution slice
No providers/pi/ creation or modification
No Vault writes (Tier 2+ and owner-scoped slice only)
No secret reads (.env, env, printenv, API keys, credentials)
No network access without explicit owner-approved execution slice
No package installation
No CI or hook wiring
No automatic promotion from draft to canonical
No open-ended Pi sessions (bounded prompt required)
No --api-key flag (credentials via .env only, never inline)
No bash, edit, or write without Tier 2+ owner approval
```

## Current Runtime Default

```
Provider: minimax
Model:    MiniMax-M3
Auth:     MINIMAX_API_KEY via .env (never --api-key flag)
```

Smoke evidence: `docs/pi-smoke-run-evidence.md`, commit `bdcc4b5`

## Pre-Dry-Run Gate

Before executing a real Pi Tier-1 run, a separate **Pi Tier-1 Dry Run Decision Gate**
review slice must confirm that all pre-conditions from `session-policy.md` are
satisfiable in the current environment. No execution may proceed without that gate.

## Authority References

| Document | Role |
|----------|------|
| `runtime/surfaces/pi/session-policy.md` | Session governance — tiers, pre-conditions, abort conditions |
| `runtime/surfaces/pi/evidence-contract.md` | Evidence rules — canonical path, diff, audit, boundary |
| `runtime/surfaces/pi/smoke-command.md` | Smoke command surface — approved shape, abort conditions |
| `runtime/surfaces/pi/handoff.md` | Handoff format — evidence path, 8-artifact list, audit rule |
| `docs/evidence-path-contract.md` | Canonical evidence path and minimal artifact structure |
| `docs/pi-runtime-surface-closure-review.md` | v0.2 closure review — surface assessment and verdict |
| `docs/baum-os-v0.1-closure-review.md` | v0.1 closure — contract inventory, evidence loop, boundary review |

## Non-Goals

```
no runtime activation
no provider adapter
no providers/pi/
no CI wiring
no secret access
no schema change
no Vault write
no automatic promotion
```
