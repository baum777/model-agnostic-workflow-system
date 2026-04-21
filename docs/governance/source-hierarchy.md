# Source Hierarchy

Class: canonical.
Use rule: use this as the canonical authority-order document for repository workflows, specs, skills, tools, and MCP evidence.

This file defines the authority order for `model-agnostic-workflow-system` as it exists today. It maps the requested model-agnostic workflow hierarchy onto the current canonical repo layout without introducing a second architecture.

## Objective

State which sources outrank others when work is planned, implemented, validated, or reviewed in this repository.

## Authority Order

The default authority order for this repo is:

1. repo governance
2. task-specific spec or explicitly scoped change request
3. workflow rules
4. skill instructions
5. tool contracts
6. MCP-returned data
7. model inference

Current repo mapping:

1. Repo governance: `AGENTS.md`, `docs/architecture.md`, `docs/authority-matrix.md`
2. Task-specific spec: the current task brief, approved plan, or canonical task artifact when present
3. Workflow rules: `WORKFLOW.md` and repo-local control-plane routing under `.agents/skills/`
4. Skill instructions: `core/skills/*/SKILL.md` and `skills/*/SKILL.md`
5. Tool contracts: `core/contracts/tool-contracts/catalog.json` as canonical, `docs/tool-contracts/catalog.json` as compatibility/export
6. MCP data: adapter outputs, provider exports, and bounded MCP-facing context where present
7. Model inference: any unstated synthesis or reasoning not directly grounded in higher-order sources

## Source Classes

- `repo governance`: canonical operating rules and authority boundaries for the repository
- `task spec`: the bounded objective and acceptance criteria for a specific change or review
- `workflow rules`: step order, routing, validation posture, and stop conditions
- `skill instructions`: reusable method guidance for a task class
- `tool contracts`: machine-readable capability definitions and constraints
- `MCP data`: fetched or transported context that can inform work but does not outrank repo authority by default
- `model inference`: conclusions not directly stated in a higher-order source

## Conflict Handling

- Preserve the higher-order source when two sources disagree.
- Treat the lower-order source as conflicting evidence, not silent override.
- If the conflict is between prose and validator behavior, the validator-backed surface is the effective enforcement plane and the mismatch should be recorded in `docs/authority-matrix.md`.
- If the task brief conflicts with repo governance, fail closed and escalate rather than normalizing the conflict away.
- If two peer sources conflict and neither clearly outranks the other, stop and report the unresolved ambiguity.

## Evidence Versus Authority

- Authority decides what governs.
- Evidence supports or challenges a conclusion without automatically becoming the governing source.
- MCP responses, generated exports, test results, and logs can be strong evidence, but they do not outrank repo governance unless an explicit repo rule says they do.
- Compatibility mirrors can be useful evidence for migration or backward-compatibility checks, but they do not become canonical merely because they exist.

## Capability Maturity Labels

Use these labels when describing capability maturity in this repo:

- `prose-governed`
- `contract-backed`
- `validator-backed`
- `runtime-implemented`

These labels describe maturity, not authority. A prose-governed canonical doc can still outrank a lower-order validator input if the validator is not the enforcement surface for that question. The compact claim-status ledger remains `implemented`, `contract-only`, `planned`, `missing`, and `unclear` in `docs/authority-matrix.md`.
