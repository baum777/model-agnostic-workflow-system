---
name: skill-creator-orchestrator
description: Repo-local control-plane skill that decides reuse, extend, or create for recurring skills without bloating always-on instructions.
version: 1.0.0
classification: local-only
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: codex-workflow-core
status: active
---

# Skill Creator Orchestrator

## Trigger
Use this skill when a workflow repeats and current skills/contracts do not cover it cleanly, and the repo-local reuse-versus-create decision must be made first.

## When Not To Use
- Do not create a skill for one-off tasks.
- Do not create a skill when an existing shared/local skill already covers the need.
- Do not create a skill to bypass unclear requirements; resolve scope first.

## Non-Goals
- This skill does not plan the underlying task.
- This skill does not author the final skill content beyond lifecycle guidance.
- This skill does not manage repository-specific overlays.

## Create-Skill Criteria
Create or refine a skill when at least one is true:
- the same workflow pattern appears across multiple tasks
- the workflow has governance or correctness gates that must stay consistent
- repeated prompts are causing drift, ambiguity, or context bloat
- the workflow benefits from a fixed output contract

## Keep-Skill-Concise Rules
- one purpose per skill
- explicit trigger and non-trigger conditions
- short ordered workflow steps
- compact output contract with stable headings
- include only references needed for execution
- move edge-case depth to linked docs, not into AGENTS

## Workflow
1. Inventory existing coverage in `skills/`, `.agents/skills/`, `docs/`, and `scripts/tools/`.
2. Decide reuse vs extension vs net-new skill.
3. Define the skill contract:
   - description
   - trigger conditions
   - when not to use
   - step sequence
   - output contract
   - done criteria
4. Keep wording operational and deterministic.
5. Validate that AGENTS only keeps routing and invariant rules; move repeatable depth into the skill.
6. Add or update `SKILL.md` in one bounded folder.

## Output Contract
- `DECISION` (reuse, extend, or create)
- `RATIONALE`
- `SKILL CONTRACT` (description, trigger, non-trigger, steps, output)
- `ACCEPTANCE CRITERIA`
- `ADOPTION NOTE` (how AGENTS routes to the skill)

## Done Criteria
- Existing assets were checked before writing net-new skill content.
- Skill scope is narrow, reusable, and non-duplicative.
- AGENTS remains lean and delegates deep repeatable logic to skills.
- The skill includes a clear trigger, workflow, and output contract.

## Quality Checks
- No authority confusion between AGENTS and skill logic.
- No canonical-truth claims without a verifiable source path.
- No long narrative sections that can be replaced by structured headings.
