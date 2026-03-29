---
name: shared-contract-discipline-review
description: Reviews additive-only shared contracts and contract drift in Sparkfined-Tradeapp.
version: 1.0.0
repo: Sparkfined-Tradeapp
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Guard the shared contract layer so backend, API, and frontend agree on envelope and schema shapes without accidental breaking changes.

## Trigger
Use when a shared contract, contract test, or response envelope changes.

## When to use
- Reviewing `shared/contracts/*`
- Checking type-contract tests or schema drift
- Auditing whether a contract is additive-only

## When not to use
- Local UI refactors that do not touch shared types
- Backend implementation changes that keep the contract stable

## Required inputs
- `shared/contracts/*`
- `shared/docs/API_CONTRACTS.md`
- `shared/tests/*`
- `backend/tests/contracts/*`

## Workflow
1. Identify the shared contract being changed.
2. Check whether the change is additive or breaking.
3. Compare backend response shapes and frontend usage against the contract.
4. Mark any implicit contract dependency that is only inferred by tests.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Contracts remain additive-only unless versioned
- Envelope shapes match documented expectations
- Contract tests cover the changed shape

## Repo grounding notes
- `shared/contracts/reasoning-prompts.ts`
- `shared/contracts/tradingTerminal.ts`
- `shared/contracts/sparkfined-dominance.ts`
- `shared/contracts/http/envelope.ts`
- `shared/docs/API_CONTRACTS.md`
- `shared/tests/type-contracts/trading-quote.contract.test.ts`

