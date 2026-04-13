# Qwen 3.6 / Qwen Code Derived Integration Guide

Class: derived.
Use rule: read this as an advisory integration guide. Do not treat Qwen product claims as canonical repo truth unless the repo has a direct enforcement, contract, or export path for them.

This file is intentionally narrow. It translates the provided Qwen 3.6 / Qwen Code spec into repo-local routing guidance and separates verified repository truth from external claims.

## Scope

- This guide maps Qwen-specific advice onto existing repo artifacts.
- It does not create a new provider-specific skill tree.
- It does not assert model internals, context limits, or runtime controls as repository truth.

## Observed

- `providers/qwen-code/README.md` is the canonical Qwen Code adapter boundary.
- `providers/qwen-code/export.json` is the Qwen Code provider export bundle.
- `providers/qwen/README.md` is the compatibility mirror for the legacy Qwen surface.
- `providers/qwen/export.json` is the legacy Qwen compatibility export bundle.
- Existing reusable skills already cover the recurring work patterns in the spec:
  - `skills/repo-intake-sot-mapper/SKILL.md`
  - `skills/planning-slice-builder/SKILL.md`
  - `skills/runtime-policy-auditor/SKILL.md`
  - `skills/patch-strategy-designer/SKILL.md`
  - `skills/post-implementation-review-writer/SKILL.md`
  - `core/skills/readiness-check/SKILL.md`
  - `core/skills/research-synthesis/SKILL.md`
  - `core/skills/migration-planner/SKILL.md`
  - `skills/failure-mode-enumerator/SKILL.md`
  - `core/skills/long-document-to-knowledge-asset/SKILL.md`

## Inferred

- Qwen Code should be treated as an execution environment, not as the source of policy truth.
- The provided `/think`, `/no_think`, approval-mode, MCP, hooks, and settings claims are operationally useful only if the target environment actually exposes them.
- Long-context claims can influence prompt composition, but repo workflows should still rely on file, diff, and contract evidence first.
- If the Qwen runtime exposes multiple model providers, the repo should still route by task class and governance risk, not by model branding.

## Recommended

### Use existing skills first

| Task class | Repo-local skill | Guidance |
| --- | --- | --- |
| Repo truth capture | `skills/repo-intake-sot-mapper/SKILL.md` | Use before any change that depends on repository reality. |
| Broad planning | `skills/planning-slice-builder/SKILL.md` or `core/skills/migration-planner/SKILL.md` | Split large work into bounded waves before execution. |
| Governance and runtime policy | `skills/runtime-policy-auditor/SKILL.md` | Use for approval boundaries, kill switches, and mode semantics. |
| Smallest safe change selection | `skills/patch-strategy-designer/SKILL.md` | Use when the next step must stay minimal and low-risk. |
| Readiness / gate checks | `core/skills/readiness-check/SKILL.md` | Use before release or handoff decisions. |
| Post-change review | `skills/post-implementation-review-writer/SKILL.md` | Use after implementation or migration slices. |
| Research and evidence synthesis | `core/skills/research-synthesis/SKILL.md` | Use when external claims need to be summarized without overstatement. |
| Failure analysis | `skills/failure-mode-enumerator/SKILL.md` | Use when the task is about abuse paths, races, or recovery. |
| Long-document compression | `core/skills/long-document-to-knowledge-asset/SKILL.md` | Use when a long spec needs to become a structured knowledge asset. |

### Keep Qwen-specific posture advisory-only

- Analysis, architecture review, and migration work should be treated as think-heavy.
- Short formatting, extraction, or direct transformation work can be think-light.
- Patch execution should happen only after repo truth is established and a smallest-safe-change strategy is selected.
- Any MCP or hook usage should be skill-scoped and should not bypass shared-core governance.

### Routing pattern

1. Start with repo truth.
2. Decide the skill and gate shape.
3. Treat external Qwen runtime features as optional accelerators, not as policy authority.
4. Fail closed if the runtime feature cannot be verified in the local environment.

## External / Unverified

The following claims came from the provided Qwen spec, but this repository does not currently verify them as canonical runtime truth:

- `Qwen3.6-Plus` as a specific hosted model name and capability bundle.
- `1M token` default context.
- `1,000 calls/day` availability in Qwen Code.
- The `/think` and `/no_think` soft switch.
- Built-in `settings.json` shape and `modelProviders` switching semantics.
- Native support for MCP, hooks, subagents, and approval-mode commands in the exact form described.
- The exact taxonomy of `plan`, `approval-mode`, `tools`, and `skills` CLI commands.

These claims may still be useful as operator guidance, but they remain external until a repo-local contract, validator, or provider export explicitly encodes them.

## Decision Boundary

- Reuse existing shared skills for all recurring repo work.
- Extend a provider adapter only when the adapter boundary itself needs a new exported contract.
- Create a new skill only if a repeated workflow cannot be covered by the current shared skills without ambiguity or drift.

## Practical Bottom Line

- Use Qwen-specific advice as a posture layer.
- Use shared-core skills as the actual operational contract.
- Do not elevate external Qwen capability claims into canonical repo truth without a concrete enforcement path.
