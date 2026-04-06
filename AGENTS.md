# Codex Operating Contract (Repo Root)

Class: canonical.
Use rule: use this as the root operating contract; defer docs hierarchy details to [docs/architecture.md](C:/workspace/main_projects/codex-workflow-core/docs/architecture.md).

## Project Overview
- Repository: `C:\workspace\main_projects\codex-workflow-core`
- Role: authoritative shared-core workflow package (skills, contracts, validators, templates).
- Canonical reusable surfaces:
  - `.codex-plugin/plugin.json`
  - `skills/`
  - `scripts/tools/`
  - `docs/`
  - `templates/codex-workflow/`
- Repo-local orchestration skills live in `.agents/skills/`.

## Highest-Value Always-On Rules
1. Operate governance-first and fail-closed.
2. Before inventing a process, check existing workflows/skills/contracts/scripts first.
3. Prefer reuse, adaptation, or composition over net-new logic.
4. Keep this file lean; move repeatable deep logic into skills.
5. Separate `Observed` vs `Inferred` vs `Recommended`.
6. Never present derived or assumed state as canonical truth.
7. If critical information is missing or contradictory, stop and escalate with explicit gaps.
8. For docs hierarchy, skill topology, and authority order, use [docs/architecture.md](C:/workspace/main_projects/codex-workflow-core/docs/architecture.md) and [docs/authority-matrix.md](C:/workspace/main_projects/codex-workflow-core/docs/authority-matrix.md).

## Word + Context Economy
- Keep always-on guidance short; route depth into skills.
- Prefer structured deliverables (checklists, contracts, runbooks, plans) over prose walls.
- Use exact paths and boundaries for claims and change descriptions.
- Reuse existing templates/contracts before creating new formats.

## Workflow Order
1. Map current truth from repo artifacts.
2. Check for an existing workflow, skill, runbook, script, or contract that already covers the task.
3. Route to the right workflow shape using `.agents/skills/workflow-core-router/SKILL.md` for non-trivial work.
4. Execute the smallest safe change set.
5. Verify against explicit acceptance criteria and gate checks.
6. Report verified facts, unresolved gaps, and next gate.

## Skill Routing Rules
- Use `.agents/skills/workflow-core-router/SKILL.md` when the task is non-trivial or artifact shape is unclear.
- Use `.agents/skills/skill-creator-orchestrator/SKILL.md` when a recurring workflow lacks a concise reusable skill.
- Use shared-core skills in `skills/` when they already fit (for example planning, intake mapping, review, test matrix, patch strategy).
- Do not duplicate existing shared skills in `.agents/skills/`; only add repo-local orchestration or gaps.

## Output Contract
For substantive tasks, return:
1. Objective
2. Current truth (`Observed`)
3. Gaps
4. Constraints / non-goals
5. Reuse decision
6. Implementation plan
7. Acceptance criteria
8. Verification / tests
9. Risks / rollback
10. Next gate

Include exact file paths for changed artifacts and mark what is verified vs not yet verified.
