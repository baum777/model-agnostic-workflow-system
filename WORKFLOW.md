# Workflow Operating Contract

Class: canonical.
Use rule: use this as the root workflow entry document for the current repository; defer documentation class rules to [docs/architecture.md](docs/architecture.md) and claim status to [docs/authority-matrix.md](docs/authority-matrix.md).

This file defines the canonical workflow posture for `model-agnostic-workflow-system` as it exists today. It is a repo overlay on the current canonical layout, not a second architecture tree.

## Objective

Provide a stable workflow entrypoint that tells maintainers and agents how work should be routed, validated, stopped, and reported in this repository.

## Workflow Classes

- `intake-and-truth-mapping`: identify governing sources, current repo reality, and reusable shared-core surfaces before proposing or making changes
- `spec-and-authority-mapping`: map an incoming spec or request onto the repo's canonical docs, contracts, validators, and compatibility boundaries
- `implementation-planning`: turn non-trivial work into bounded slices using existing planning and verification surfaces
- `implementation`: make the smallest safe change set that matches the governing sources and declared write scope
- `verification-and-review`: run validator/eval gates, compare results against acceptance criteria, and separate verified truth from unresolved gaps
- `migration-and-compatibility`: change canonical surfaces while preserving explicit compatibility mirrors where needed
- `readiness-and-release-review`: assess whether a change is safe to promote without implying runtime state that is not artifact- or validator-backed

## Standard Phase Order

1. Identify the governing sources for the task.
2. Check whether an existing workflow, skill, contract, validator, or script already covers the need.
3. Route to the right workflow shape using [`.agents/skills/workflow-core-router/SKILL.md`](.agents/skills/workflow-core-router/SKILL.md) when the artifact shape is non-trivial.
4. Gather bounded repo evidence and separate observed truth from inference.
5. Plan or implement the smallest safe slice.
6. Run required validation and eval gates.
7. Report results with explicit truth labels, remaining gaps, and next gate.

## Routing Rules

- Use [`.agents/skills/workflow-core-router/SKILL.md`](.agents/skills/workflow-core-router/SKILL.md) to choose the primary artifact shape when the task is not an obvious one-step edit.
- Use [`skills/planning-slice-builder/SKILL.md`](skills/planning-slice-builder/SKILL.md) for bounded implementation waves, dependencies, and acceptance criteria.
- Use [`skills/test-matrix-builder/SKILL.md`](skills/test-matrix-builder/SKILL.md) when verification coverage must be made explicit before merge or promotion.
- Use `core/contracts/` when the task is primarily about canonical machine-readable contract truth.
- Use `docs/` for canonical prose authority, `core/` for canonical machine-readable authority, and compatibility mirrors only when backward compatibility is the actual goal.
- Do not create a new shared skill when an existing shared skill, contract, or validator already covers the task sufficiently.

## Validation Posture

- Read broadly when needed to understand authority, but write narrowly by default.
- Treat validator-backed surfaces as the highest executable authority in this repo.
- Treat contract-backed surfaces as machine-readable guidance unless a validator explicitly enforces them.
- Treat prose-governed docs as canonical authority for policy and interpretation unless a validator-backed surface overrides them.
- Treat runtime-implemented claims as valid only when a concrete runnable path or generated artifact proves them.
- Required repo gates for substantive shared-core changes are normally `npm run validate`, `npm run validate-neutral`, and `npm run eval`.

## Stop Conditions

- Stop and fail closed when governing sources conflict and no higher-order source resolves the conflict.
- Stop when a requested capability would require implying runtime MCP or production behavior that is not implemented.
- Stop when a validator-backed gate that should be blocking cannot run or returns an unresolved failure.
- Downgrade to advisory-only when the repo has a prose or contract surface but no validator-backed or runtime-implemented proof for the claim being asked of it.

## Handoff And Reporting Expectations

- Report exact file paths for changed or consulted artifacts.
- Distinguish clearly between observed, inferred, recommended, planned, and missing state.
- State whether a result is prose-governed, contract-backed, validator-backed, or runtime-implemented when describing capability maturity.
- Preserve compatibility surfaces intentionally and name them as compatibility mirrors instead of treating them as canonical by default.
- When work remains incomplete, report the next gate or blocker instead of implying completion.

## Capability Maturity Labels

- `prose-governed`: the behavior or rule is documented in canonical prose, but no enforcing validator proves it
- `contract-backed`: the behavior or rule is defined in a machine-readable contract, but no enforcing validator proves it
- `validator-backed`: a validator or checker enforces the rule against repo artifacts
- `runtime-implemented`: a concrete runnable tool, script, or generated artifact demonstrates the capability in practice

These labels describe capability maturity. They do not replace the claim-status labels in [docs/authority-matrix.md](docs/authority-matrix.md), which remain the compact ledger for `implemented`, `contract-only`, `planned`, `missing`, and `unclear`.
