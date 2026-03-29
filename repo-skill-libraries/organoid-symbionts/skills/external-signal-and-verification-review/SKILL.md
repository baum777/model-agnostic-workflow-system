---
name: external-signal-and-verification-review
description: Reviews market and onchain read paths plus truth-resolution boundaries in organoid_Symbionts.
version: 1.0.0
repo: organoid_Symbionts
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Check that external signal ingestion stays read-focused, minimally trusted, and aligned with the repo's verification boundary.

## Trigger
Use when market adapters, onchain adapters, or truth resolution logic changes.

## When to use
- Reviewing adapter behavior before it reaches the runtime
- Auditing truth or identity verification logic
- Checking the boundary between external data and runtime decisioning

## When not to use
- Pure local state changes
- Render topology work

## Required inputs
- `src/adapters/market/*`
- `src/adapters/onchain/*`
- `src/tools/marketTool.ts`
- `src/tools/onchainTool.ts`
- `src/truth/*`
- `src/identity/*`

## Workflow
1. Trace the external signal from adapter to downstream consumer.
2. Check whether any path can mutate state or publish without explicit approval.
3. Review sanitization, truth checks, and fallback behavior.
4. Identify any trust assumptions that are not directly coded.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Adapter paths stay read-focused unless explicitly gated
- Verification logic does not silently trust upstream data
- Sanitizers and truth gates are applied before use

## Repo grounding notes
- `src/adapters/market/dexscreenerAdapter.ts`
- `src/adapters/market/geckoAdapter.ts`
- `src/adapters/onchain/solanaRpcAdapter.ts`
- `src/tools/marketTool.ts`
- `src/tools/onchainTool.ts`
- `src/truth/truthGate.ts`
- `src/identity/onchainVerify.ts`

