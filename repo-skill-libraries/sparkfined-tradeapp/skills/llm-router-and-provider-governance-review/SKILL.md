---
name: llm-router-and-provider-governance-review
description: Reviews provider routing, fallback policy, and prompt output discipline in Sparkfined-Tradeapp.
version: 1.0.0
repo: Sparkfined-Tradeapp
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Audit the LLM router so provider choice, fallback behavior, and budget discipline stay deterministic.

## Trigger
Use when provider selection, tier policy, or prompt execution changes.

## When to use
- Reviewing provider adapters or router logic
- Checking tier-aware budget or fallback behavior
- Auditing prompt execution and output schema validation

## When not to use
- Non-LLM domain logic
- Frontend-only changes

## Required inputs
- `backend/src/lib/llm/*`
- `backend/src/routes/llm.ts`
- `backend/src/routes/reasoning/engine.ts`
- `shared/docs/PROVIDERS.md`

## Workflow
1. Trace provider selection from request to adapter.
2. Check budget, tier, and fallback ordering.
3. Verify output validation is strict enough for the route type.
4. Call out any provider assumption that is only implied by current code.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Provider routing is deterministic
- Fallback order is explicit and documented
- Output schemas are validated before response

## Repo grounding notes
- `backend/src/lib/llm/router/router.ts`
- `backend/src/lib/llm/router/schema.ts`
- `backend/src/lib/llm/providers/deepseek.ts`
- `backend/src/lib/llm/providers/grok.ts`
- `backend/src/lib/llm/providers/openai.ts`
- `shared/docs/PROVIDERS.md`

