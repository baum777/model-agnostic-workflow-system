---
name: alerts-and-webhook-flow-review
description: Reviews alerts, webhooks, SSE, and push flows in Sparkfined-Tradeapp.
version: 1.0.0
repo: Sparkfined-Tradeapp
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Check the alerting and webhook surfaces so alert delivery, watch cancellation, and push handling remain coherent.

## Trigger
Use when alert routes, push subscriptions, or webhook code changes.

## When to use
- Reviewing alert CRUD or watch flows
- Auditing push subscription or webhook behavior
- Checking SSE or event-stream behavior

## When not to use
- Journal-only or trading-only changes
- Backend routes outside the alerts domain

## Required inputs
- `backend/src/domain/alerts/*`
- `api/alerts/*`
- `api/wallet/webhook/helius.ts`
- `apps/backend-alerts/src/`

## Workflow
1. Trace the alert from creation to delivery or cancellation.
2. Check whether push/webhook paths remain separate from regular CRUD paths.
3. Verify the backend and API variants agree on contract shape.
4. Report any webhook or SSE assumption that is only implied by the tree.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Push and webhook routes are isolated from core CRUD
- Event streams have explicit ownership
- Alerts flow is consistent across backend and auxiliary service code

## Repo grounding notes
- `backend/src/domain/alerts/index.ts`
- `backend/src/domain/alerts/repo.ts`
- `backend/src/domain/alerts/twoStageMachine.ts`
- `api/alerts/index.ts`
- `api/alerts/stream.ts`
- `api/wallet/webhook/helius.ts`
- `apps/backend-alerts/src/`

