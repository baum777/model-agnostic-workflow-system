<!-- language: en -->
# MiniMax Provider Workflow

Status: prose-governed scaffold
Extends: providers/minimax/README.md
Owner: shared-core
Authority: model-agnostic-workflow-system/AGENTS.md → WORKFLOW.md
Stand: 2026-06-08
Capability maturity: prose-governed
Execution status: applied
Canonical claim: none — this file is provider-local prose, not portable-core truth

## Scope

Extends `providers/minimax/README.md` with provider-specific workflow guidance.
It does not become canonical shared-core behavior. Authoritative truth for the
MiniMax adapter lives in:

- `core/contracts/provider-capabilities.json:148-174` (capability profile)
- `providers/minimax/adapter.mjs` (adapter implementation)
- `providers/minimax/export.json` (generated export bundle)

This file is a working companion for prompt design, task framing, and
failure-mode awareness when targeting the MiniMax provider. It must not
override, replace, or silently extend any portable-core contract.

## When To Use

- Prompt design for `abab6.5s`, `abab6.5g`, `abab5.5` chat models
- TTS routing for `speech-01-turbo` (provider-only, not in portable core)
- Tool-call packaging against `/v1/text/chatcompletion_pro`
- JSON-mode prompting (requires explicit prompt shaping)
- Choosing between deterministic LLM node vs. agent for MiniMax-backed flows

## Model Reference

### Observed (from `core/contracts/provider-capabilities.json:163-165`)

| Model          | Type | Endpoint                      | Notes                                                              |
| -------------- | ---- | ----------------------------- | ------------------------------------------------------------------ |
| `abab6.5s`     | chat | `/v1/text/chatcompletion_pro` | default chat model                                                 |
| `abab6.5g`     | chat | `/v1/text/chatcompletion_pro` |                                                                    |
| `abab5.5`      | chat | `/v1/text/chatcompletion_pro` |                                                                    |
| `speech-01-turbo` | TTS | `/v1/t2a_v2`                  | provider-only, not exposed in portable core skills                |

### Inferred (see footnote ¹)

| Model         | Type         | Context     | Strength                                          |
| ------------- | ------------ | ----------- | ------------------------------------------------- |
| MiniMax M3    | LLM (current) | 1M Token¹   | Coding, Agentic, Multimodal, Desktop-Ops          |
| MiniMax M2.5  | LLM          | 1M Token¹   | Agent-Harness, Tool-Use, Dynamic Skill Search     |
| MiniMax Agent | Platform     | Multi-Agent | Long-Horizon, Sub-Agent-Delegation, MCP-Integration |
| MiniMax Code  | Coding-Agent | —           | Code-first, Claude-Code-kompatibel¹               |

Architecture: MoE — 230B total / 10B active¹ → ~100 tokens/sec¹, ~92% cheaper than Claude Sonnet 4.5¹

## Cross-Reference: Anthropic-Style Interleaved Thinking

Interleaved thinking is an **Anthropic Claude API** concept, not a MiniMax
primitive. Its authoritative home is `providers/anthropic-claude/`. The
MiniMax adapter is OpenAI-compatible (`/v1/text/chatcompletion_pro`), not
Anthropic-API-compatible, so Anthropic-style interleaved-thinking semantics
must not be assumed on this adapter.

When building MiniMax prompts that benefit from reasoning continuity:

- Use the OpenAI-compatible tool-calling path (`functions` / `tools` array)
- Maintain reasoning state via the portable core's history discipline
  (see `core/contracts/...`) — not via an Anthropic-specific thinking block
- Do not pass Anthropic-style `thinking`-type content blocks to MiniMax
- If reasoning continuity is critical, treat it as a portable-core concern,
  not a provider concern

## Task Design (Prompt Structure)

For non-trivial MiniMax tasks, the prompt should specify:

- **Deliverable** — what exactly must come out
- **Audience** — who consumes the result
- **Files** — upload paths or references
- **Format** — output format (MD, JSON, code, report, PPT, ...)
- **Constraints** — what the agent must not do; out-of-scope
- **Success Criteria** — how to recognize a successful run

## Context Window Management

- `< 30%` token utilization → normal execution
- `≥ 30%` token utilization → selective history compression
  - Do NOT blindly drop the full history
  - Preserve reasoning state, tool results, and decision traces
  - Compress prose and intermediate results before dropping raw tool output

## Agent Threshold

| Task type                                  | Recommendation                          |
| ------------------------------------------ | --------------------------------------- |
| Deterministic, well-defined, low-entropy   | LLM node in the workflow is enough      |
| Open-ended, multi-step, ambiguous          | Agent threshold crossed → use agent     |
| Recurring with defined output              | Deterministic pipeline + LLM node      |

**Travel-Light Principle:** start the agent with a minimal system prompt and
core knowledge. Tighten behavioral boundaries iteratively based on observed
production behavior, not on assumed design intent.

## Design Principles (Inferred from MiniMax build experience 2025)¹

1. **Tinker First — Architecture Second.** Explore native model strengths
   before committing to a fixed architecture. Models evolve faster than
   pipelines; force-fitting new models into old architectures creates debt.
2. **Vibe Demos, not PRDs.** Define the product through the first 10 user
   queries, not through a feature list. Prototype → validate → then
   production code.
3. **Agent-as-Judge for Evaluation.** An evaluator agent runs code,
   verifies data, and tracks results over time. Target low variance, not
   maximum single-run performance.
4. **Context & State = Moat.** Agents that live persistently in context
   outperform one-off executions. A marketing agent should monitor trends,
   react to traffic spikes, and reflect on performance over time.

## Risks & Blind Spots

| Risk                       | Concrete                                                                 | Mitigation                                                              |
| -------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| State Loss                 | Missing reasoning continuity → loops, repeated errors                    | Portable-core history discipline; do not drop tool result blocks         |
| Credit Burn                | Complex tasks: cost not predictable                                      | Budget cap; scope-bound task framing                                    |
| Output Verification        | No auto-validation of deliverables                                       | Mandatory manual review step                                            |
| Multi-Model Overhead       | MiniMax Agent may use multiple models internally                          | Cost and latency calculation before production                          |
| Scope Creep                | Over-broad prompts → agent interprets autonomously                       | Explicit constraints and success criteria in every prompt                |
| Hallucination in Research  | Deep-research outputs without source verification                        | Source-check as a mandatory step                                        |
| Anthropic-API Assumption   | Treating MiniMax like an Anthropic-compatible endpoint                   | Use OpenAI-compatible tool-calling path; see Cross-Reference section   |

## Evaluation Framework

Treat evaluation like a junior-employee review, not an academic benchmark:

1. **Outcome Quality** — is the deliverable usable?
2. **Reasoning Trajectory** — was the reasoning path sound and traceable?
3. **Consistency** — does the agent deliver stable, predictable results over time?

Target: low variance with positive ROI. Do not optimize for perfection.
The evaluator agent should run code and verify data autonomously; results
are tracked over time, not as point-in-time snapshots.

## Integration Into Workspace Structure

```
model-agnostic-workflow-system/
  ├── AGENTS.md                    ← repo canonical
  ├── WORKFLOW.md                  ← workflow routing
  ├── core/                        ← portable canonical contracts + skills
  ├── providers/
  │   ├── README.md                ← provider adapter policy
  │   ├── anthropic-claude/        ← canonical Claude export boundary
  │   ├── openai-codex/            ← canonical OpenAI / Codex export boundary
  │   ├── qwen-code/               ← canonical Qwen Code export boundary
  │   ├── kimi-k2_5/               ← canonical Kimi K2.5 export boundary
  │   └── minimax/                 ← MiniMax provider adapter
  │       ├── README.md            ← adapter frontdoor (scaffolded)
  │       ├── adapter.mjs          ← adapter implementation
  │       ├── export.json          ← generated export bundle
  │       └── workflow.md          ← this file (prose-governed scaffold)
```

**Referenced by:**

- `providers/minimax/README.md` (via See also link)
- Repo-local `AGENTS.md` files when MiniMax is the chosen model provider

**Not replaced by this file:**

- Repo-local product logic
- Portfolio governance
- Chat-room SOT files
- `core/contracts/provider-capabilities.json` (canonical capability truth)
- `providers/anthropic-claude/` (canonical home for Anthropic-API concepts)

## Maintenance Rule

Update this file when:

- MiniMax releases a new main chat model family
- `/v1/text/chatcompletion_pro` API surface changes
- New failure patterns are observed in production use
- The `core/contracts/provider-capabilities.json` MiniMax entry changes materially

Always update the `Stand:` date and add a sources line for any newly verified
claim. Promotions to `contract-backed` or `validator-backed` maturity require
concrete contracts or validators, not prose updates here.

---

## Footnotes

¹ **Inferred** — the following claims are not verified against any primary
source in this repository: M3 / M2.5 / Agent / Code lineup, 1M Token
context, MoE 230B total / 10B active, ~100 tokens/sec, ~92% cheaper than
Claude Sonnet 4.5, "Claude-Code-kompatibel". Treat as unverified until
backed by a named official MiniMax document.

Authoritative model family and packaging in this repository:

- Chat: `abab6.5s`, `abab6.5g`, `abab5.5`
- TTS: `speech-01-turbo` (provider-only)
- Packaging: `openai-compatible-api`, `tool-calls`
- Source: `core/contracts/provider-capabilities.json:148-174`
