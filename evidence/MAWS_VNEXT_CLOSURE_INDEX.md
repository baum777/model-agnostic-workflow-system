# MAWS vNext Closure Evidence Index

Class: canonical evidence index for the MAWS vNext activation closure (2026-09-26).
Status: FINAL. This index maps every closure-relevant evidence set to its
classification (FINAL / HISTORICAL / SUPERSEDED) so the workstream can be
revisited months later without ambiguity. Historical evidence is truthful
record, never error.

## Canonical state

```text
MAWS main                      fe3a3973a87b5e76bb5f6efab6d3e82201ccca6b
PR #9 merge                    f481c2f2908fe18751b33c3470e1d57397d05add (MERGED)
Final live evidence commit     19ef2c63779c749a57cc763a431d23a24a6affb4
Registry PR #96                MERGED, 300ffe16dc5b02fc2f8d9a229a3c720624926be1
Registry canonicalization      cf613da01407a6194ea38c843bb8fa4ae41c6eeb
Registry disposition           UPDATED (bound to 300ffe16, at MAWS fe3a397)
baum-os root pin               fe3a397 (advancement commit 6782a0f)
Live activation                LIVE_ACTIVATION_PASS (2026-09-26T01:04Z, exit 0)
CompletionDecision             COMPLETED (full slice)
Production deployment          NOT CLAIMED
```

## Evidence sets

| Path | Classification | Content |
| --- | --- | --- |
| `maws-vnext-implementation-2026-09-25/` | HISTORICAL | Run 1 implementation of the original (later corrected) Codex→OpenRouter lane; JSONL fail-closed fixes; registry disposition (later UPDATED to registry commit f5dd6b01 / PR #94). |
| `maws-vnext-openrouter-activation-2026-09-25/` | SUPERSEDED | Run 1 activation attempt (PARTIAL; synthetic-credential transport probe). Superseded by the corrective ChatGPT topology. |
| `maws-vnext-chatgpt-openrouter-activation-2026-09-25/` | HISTORICAL (disposition file is LIVE) | Corrective topology run (Run 2): Codex ChatGPT plan executor restore, Jev→OpenRouter Decisions transport, three-lane runner. `registry-disposition.json` is the canonical disposition record, updated 2026-09-26 to UPDATED with both merge SHAs bound. |
| `codex-chatgpt-auth-controller-2026-09-26/` | HISTORICAL | Auth-controller implementation run: 11-state OAuth lifecycle, live AUTH_HEALTHY check, mandatory stale/healthy fixtures, runnable tracer scripts (referenced by the closure run), auth-slice-scoped CompletionDecision (superseded in scope by the full-slice decision). |
| `maws-vnext-final-live-closure-2026-09-26/` | **FINAL** | The complete closure chain proof: LIVE_ACTIVATION_PASS evidence, AUTH_HEALTHY receipt, PASS tracers (Jev routing incl. live RoutingDecision + ExecutorBinding; Codex; OpenRouter model `deepseek/deepseek-v4.1-flash`), full-slice CompletionDecision COMPLETED, attempt1/attempt2 blocker history preserved, NO_CHANGE disposition for the closure run. |
| `MAWS_VNEXT_FINAL_CLOSURE_MANIFEST.md` | FINAL | Authoritative short manifest (see manifest). |
| `maws-vnext-closure-state.json` | FINAL | Machine-readable closure state (evidence only, no shared contract). |

## Timeline

```text
2026-09-25  implementation (Run 1: Codex→OpenRouter coupling; JSONL fail-closed)
         →  initial live activation (Run 1 PARTIAL; synthetic transport proof)
         →  provider correction (Run 2: Codex→ChatGPT plan, Jev→OR Decisions)
2026-09-26  OAuth controller (auth health gating, stale detection, explicit login)
         →  final live activation attempts (1: env-inheritance BLOCKED;
            2: guardrail 404 then 402 → bounded max_tokens fix 6ef7797)
         →  LIVE_ACTIVATION_PASS (01:04Z; deepseek/deepseek-v4.1-flash)
         →  full-slice CompletionDecision COMPLETED
         →  PR #9 merge (f481c2f)
         →  Registry canonicalization (cf613da) + PR #96 merge (300ffe16)
         →  MAWS disposition UPDATED (fe3a397)
         →  baum-os root pin advancement (6782a0f → fe3a397)
```

Earlier PARTIAL / BLOCKED / HUMAN_GATE / wrong-slug / credential-missing
outcomes inside the historical sets are truthful run records of their time,
not errors, and are superseded only by the FINAL set above.
