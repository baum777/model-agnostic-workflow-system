# Documentation Navigator

Class: operational.
Use rule: index only; do not treat this page as authority.

Canonical truth lives in [architecture.md](architecture.md) and [authority-matrix.md](authority-matrix.md). For operator flow, start at [usage.md](usage.md). For root governance, read [../AGENTS.md](../AGENTS.md).

## Read First

- [../README.md](../README.md)
- [../WORKFLOW.md](../WORKFLOW.md)
- [architecture.md](architecture.md)
- [authority-matrix.md](authority-matrix.md)
- [governance/source-hierarchy.md](governance/source-hierarchy.md)
- [mcp/policy.md](mcp/policy.md)
- [secret-handling.md](secret-handling.md)
- [usage.md](usage.md)
- [../core/README.md](../core/README.md)
- [../contracts/README.md](../contracts/README.md)
- [../providers/README.md](../providers/README.md)
- [../evals/README.md](../evals/README.md)
- [ui-ux-composition-branch.md](ui-ux-composition-branch.md) when the task touches the UI/UX composition branch

## Documentation Classes

- Canonical: `../WORKFLOW.md`, `architecture.md`, `authority-matrix.md`, `governance/source-hierarchy.md`, `mcp/policy.md`, `compatibility.md`, `lock-model.md`, `portability.md`, `provider-capability-matrix.md`, `repo-overlay-contract.md`, `secret-handling.md`, `shared-with-local-inputs.md`, `repo-intake-skill-contract.md`, `runtime-policy-skill-contract.md`, `ui-ux-composition-branch.md`
- Operational: `README.md`, `usage.md`, `adoption-playbook.md`, `consumer-rollout-playbook.md`, `maintainer-commands.md`, `validation-checklist.md`, `authoring-guides.md`
- Derived: `overview.md`, `eval-baseline.md`, `ui-ux-composition/*`
- Archive: `extraction-roadmap.md`, `../CHANGELOG.md`

## Repository Entry Points

- `../WORKFLOW.md` root workflow entry for taxonomy, routing, validation posture, stop conditions, and handoff expectations
- `../core/` portable core slice
- `../contracts/` canonical registries and compatibility mirrors
- `../providers/` adapter boundary and compatibility exports
- `../skills/` reusable shared-exported skills
- `../.agents/skills/` repo-local control-plane skills
- `../scripts/tools/` validators and deterministic helper scripts
- `../policies/` machine-readable policy layer for canonical boundary rules
- `../templates/` shared workflow templates
- `../examples/` shared workflow examples

## Capability Maturity Labels

- `prose-governed`: canonical prose exists, but no enforcing validator proves the claim
- `contract-backed`: machine-readable contract exists, but no enforcing validator proves the claim
- `validator-backed`: an observed validator or checker enforces the claim
- `runtime-implemented`: a runnable script, tool, or generated artifact proves the capability

These labels describe maturity only. Claim-status truth still lives in [authority-matrix.md](authority-matrix.md).

## Overlay Note

- This repo adopts the current Phase 1 model-agnostic workflow spec as an overlay on the existing canonical layout.
- The illustrative spec tree is not mirrored literally here.
- `../core/contracts/tool-contracts/catalog.json` is the canonical machine-readable tool catalog.
- `tool-contracts/catalog.json` remains a compatibility/export surface and must not become a second canonical source.

## Rule

- If a page restates a governing rule, it should link back to the canonical doc instead of redefining it.
