---
name: trading-execution-safety-review
description: Reviews quote, swap, and wallet-facing execution safety in Sparkfined-Tradeapp.
version: 1.0.0
repo: Sparkfined-Tradeapp
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Guard the trading path from quote drift, unsafe execution, and boundary violations between UI and backend.

## Trigger
Use when quote, swap, terminal, or wallet-related code changes.

## When to use
- Reviewing quote or swap behavior
- Checking terminal and Research integration with the backend
- Auditing wallet-facing safety and fee presentation

## When not to use
- Journal or alerts work with no trading effect
- Reasoning-only changes

## Required inputs
- `backend/src/lib/trading/*`
- `shared/trading/*`
- `api/quote.ts`
- `api/swap.ts`
- `src/components/terminal/*`
- `docs/TERMINAL.md`

## Workflow
1. Trace the quote or swap from UI to backend to provider.
2. Check stale quote handling, fee preview, and validation order.
3. Confirm the user-facing boundary is non-custodial and explicit.
4. Note any safety assumption that is inferred from tests or component names.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Quote and swap paths remain deterministic enough for execution
- UI warnings match backend safety assumptions
- Wallet-facing actions do not imply custody

## Repo grounding notes
- `backend/src/lib/trading/feeEngine.ts`
- `backend/src/lib/trading/jupiterProvider.ts`
- `backend/src/lib/trading/terminalSchemas.ts`
- `shared/trading/swap/SwapProvider.ts`
- `shared/trading/fee/feeEngine.ts`
- `api/quote.ts`
- `api/swap.ts`
- `src/components/terminal/`

