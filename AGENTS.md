# Model-Agnostic Workflow System Operating Contract (Repo Root)

Class: canonical.
Use rule: use this as the root operating contract; defer docs hierarchy details to [docs/architecture.md](docs/architecture.md).

## Project Overview
- Repository: `model-agnostic-workflow-system`
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
8. For docs hierarchy, skill topology, and authority order, use [docs/architecture.md](docs/architecture.md) and [docs/authority-matrix.md](docs/authority-matrix.md).

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

## Execution Claim Policy
- Enforce a strict distinction between execution status and validation outcome.
- Execution status is limited to: `proposed`, `drafted`, `applied`, `verified`.
- Validation outcome is limited to: `PASS`, `BLOCKED`.
- Do not mix execution status and validation outcome in one field.
- A formulated change is not an applied change.
- A proposed log or documentation entry is not an inserted entry.
- Plan is not apply. Review or audit is not execution.
- Execution verbs such as `inserted`, `updated`, `implemented`, `documented`, `completed`, `eingetragen`, `aktualisiert`, `umgesetzt`, `dokumentiert`, and `abgeschlossen` are allowed only for `applied` or `verified`.
- `applied` requires all of the following:
  - a real write step occurred
  - the changed artifact is named explicitly
  - the write target path or surface is named explicitly
- `verified` requires `applied` plus explicit post-write verification evidence:
  - which artifact state was read after the write
  - how the new state was recognized
  - a concrete verification reference (file path, command or validator, and result)
- If write evidence or post-write verification evidence is missing, fail closed and report `BLOCKED` as the validation outcome.

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

<!-- workspace-root-sync:agents:start -->
## Workspace Root Integration

Class: repo-local agent frontdoor extension.
Use rule: read after this repository's own opening instructions. The workspace root `README.md` and `AGENTS.md` route entry, authority checks, reusable-surface checks, evidence, and stop rules; this repository's local files remain the canonical source for repo-specific product, runtime, archive, contract, and implementation truth.

### Authority And Scope

- Repo-local `AGENTS.md`, `README.md`, `docs/`, manifests, contracts, validators, tests, and workflow files govern this repository.
- Workspace-root files provide routing and constraints only; they do not replace repo-local architecture, implementation, product, runtime, or archive truth.
- Portfolio surfaces may classify, coordinate, or record cross-repo work, but they do not override this repository unless this repository explicitly adopts them.
- Shared-core assets under `model-agnostic-workflow-system/` are the reusable authority for portable skills, contracts, templates, validators, provider exports, and workflow routing patterns.
- For non-trivial, cross-repo, governance-related, reusable, prompt/system-prompt, validator, template, skill, or workflow/path-routing work, check existing repo-local and shared-core assets before creating a new surface.

### Entry Sequence

1. When entering from `/home/baum/Schreibtisch/workspace/main_projects`, read the root `README.md` and root `AGENTS.md` first.
2. Read this repository's frontdoors next: `AGENTS.md`, `README.md`, relevant `docs/`, manifests, contracts, validators, tests, and local workflow files.
3. Identify owner, scope, canonical file, expected write targets, dirty/user-made changes, validation path, and next gate before editing.
4. Prefer existing repo-local or shared-core scripts, templates, validators, contracts, and docs over new files.
5. Apply the smallest safe change.
6. Verify by reading changed state and running the relevant local checks.
7. Report results with exact paths, evidence, unresolved gaps, and next gate.

### TTD-first / TDD-inside

For meaningful work, state a compact TTD frame before writing:

- Decision: what must become unambiguously true after the slice.
- Owner / Scope: which repo, surface, file family, or authority plane owns the change.
- Contract: which file, API behavior, UI state, schema, policy, or doc proves the decision.
- Gate / Test: the smallest check that would fail if the decision is false.
- Implementation Slice: the smallest safe change needed to make the gate pass.
- Evidence: the command, output, file, or log that proves the result.
- Next Gate: what remains deliberately not claimed or deferred.

Use TDD inside implementation-bearing slices. TDD tests code behavior; TTD tests whether the development claim is valid. A task is done only when the claimed decision state is locally verifiable with evidence, or when the result is explicitly reported as `partial` or `BLOCKED`.

### Evidence Language

Use exact paths and label claims as:

- `Observed`: directly read from files, commands, repo state, or tool output.
- `Inferred`: reasoned from observed evidence.
- `Recommended`: proposed next action.
- `Applied`: a real write occurred and the path is named.
- `Verified`: applied change was read back or checked with named evidence.
- `BLOCKED`: authority, source, scope, validation, permission, or preservation of existing work is insufficient.

Do not present imported, summarized, compressed, assumed, or loose-doc context as canonical repo truth unless the owning surface has reviewed and promoted it.

### Stop Conditions

Stop and report `BLOCKED` when:

- owner, scope, authority, source, or validation is unclear;
- root, portfolio, shared-core, and repo-local guidance conflict;
- a loose doc, chat summary, archive, or imported source would drive implementation without owning-surface approval;
- required checks or evidence cannot prove the claim;
- an edit would overwrite user or agent work that was not created by the current task.
<!-- workspace-root-sync:agents:end -->
