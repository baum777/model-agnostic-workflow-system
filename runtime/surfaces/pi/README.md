# Pi Runtime Surface

## Class
runtime surface / docs-only / execution-surface skeleton

## Status
docs-only skeleton — no runtime implementation

## Purpose
Pi is a local execution surface / CLI-agent runner for Baum-OS governed work.

Pi is not an LLM provider and must not be represented as `providers/pi/`.

## Current Evidence
- Smoke evidence: `docs/pi-smoke-run-evidence.md`, commit `bdcc4b5`
- Sandbox policy: `docs/pi-harness-sandbox-working-plan.md`, commit `43b68b5`
- Runtime surface decision: `docs/pi-runtime-surface-skeleton-decision.md`, commit `08e3fba`

## Boundaries
- no runtime code
- no provider adapter
- no `providers/pi/`
- no autonomous open-ended sessions
- no secrets in commands, logs or evidence
- no `--api-key`
- no `bash`, `edit`, `write` without approval

## Default Mode
- Default zone: S0 Read-only Audit
- Default network: NET_0
- Default vault mode: read-only
- Default subagent mode: read-only

## Files In This Surface
- `smoke-command.md`
- `evidence-contract.md`
- `session-policy.md`
- `handoff.md`
