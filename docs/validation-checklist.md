# Shared Core Validation Checklist

Class: operational.
Use rule: read as a gate list that references enforcement surfaces; do not infer a physical docs-class directory split from this checklist.

This is an operational gate, not the canonical authority source.

## Enforced Checks

These items are expected to be backed by scripts or validators.

- [ ] `model-agnostic-workflow-system/package.json` exists
- [ ] `model-agnostic-workflow-system/package.json` declares the current provider-neutral package version
- [ ] `model-agnostic-workflow-system/CHANGELOG.md` contains the release entry for the current package version
- [ ] `model-agnostic-workflow-system/.codex-plugin/plugin.json` exists and matches the package version
- [ ] `model-agnostic-workflow-system/core/README.md` exists and describes the portable core slice
- [ ] `model-agnostic-workflow-system/core/contracts/core-registry.json` exists and validates
- [ ] `model-agnostic-workflow-system/core/contracts/provider-capabilities.json` exists and validates
- [ ] `model-agnostic-workflow-system/core/contracts/output-contracts.json` exists and validates
- [ ] `model-agnostic-workflow-system/core/contracts/workflow-routing-map.json` exists and validates
- [ ] `model-agnostic-workflow-system/core/contracts/tool-contracts/catalog.json` exists and validates
- [ ] `model-agnostic-workflow-system/core/skills/` contains the portable priority skills
- [ ] `model-agnostic-workflow-system/providers/openai-codex/` contains the canonical OpenAI-Codex adapter
- [ ] `model-agnostic-workflow-system/providers/anthropic-claude/` contains the canonical Claude adapter
- [ ] `model-agnostic-workflow-system/providers/qwen-code/` contains the canonical Qwen Code adapter
- [ ] `model-agnostic-workflow-system/providers/kimi-k2_5/` contains the canonical Kimi K2.5 adapter
- [ ] `model-agnostic-workflow-system/docs/architecture.md` defines the documentation authority model
- [ ] `model-agnostic-workflow-system/docs/authority-matrix.md` records claim status and evidence notes
- [ ] `model-agnostic-workflow-system/docs/secret-handling.md` exists as the single canonical secret-handling policy
- [ ] `model-agnostic-workflow-system/docs/usage.md` exists as the operational entrypoint
- [ ] `model-agnostic-workflow-system/docs/workflows/implementation-and-handoff.md` and `model-agnostic-workflow-system/docs/workflows/verification-and-certification.md` exist as bounded canonical deep dives
- [ ] `model-agnostic-workflow-system/policies/secret-classes.yaml` exists and validates
- [ ] `model-agnostic-workflow-system/policies/tool-capabilities.yaml` exists and validates
- [ ] `model-agnostic-workflow-system/docs/` contains the canonical docs, operational docs, derived docs, and archive docs
- [ ] `model-agnostic-workflow-system/contracts/core-registry.json` and `model-agnostic-workflow-system/contracts/provider-capabilities.json` remain compatibility mirrors
- [ ] `model-agnostic-workflow-system/providers/` contains the provider adapter scaffolds
- [ ] `model-agnostic-workflow-system/providers/<provider>/export.json` files are regenerated from the neutral registry
- [ ] Provider exports declare canonical `sourceContracts` paths and preserve canonical-vs-compatibility ownership boundaries
- [ ] Provider exports declare `capabilityOwnership` fields that point to canonical provider capability contracts and projection policy
- [ ] `model-agnostic-workflow-system/skills/` contains the mirrored shared skills
- [ ] `model-agnostic-workflow-system/core/skills/repo-audit/SKILL.md` is present and declares the portable core metadata
- [ ] `model-agnostic-workflow-system/skills/repo-intake-sot-mapper/SKILL.md` is classified as `shared-with-local-inputs`
- [ ] `model-agnostic-workflow-system/skills/runtime-policy-auditor/SKILL.md` is classified as `shared-with-local-inputs`
- [ ] `model-agnostic-workflow-system/docs/shared-with-local-inputs.md` documents the local-input pattern
- [ ] `model-agnostic-workflow-system/docs/repo-intake-skill-contract.md` documents the contract shape
- [ ] `model-agnostic-workflow-system/docs/runtime-policy-skill-contract.md` documents the runtime-policy contract shape
- [ ] `model-agnostic-workflow-system/templates/` contains the shared templates
- [ ] `model-agnostic-workflow-system/templates/codex-workflow/README.md` maps task/review/handoff templates to canonical workflow/output contracts
- [ ] `model-agnostic-workflow-system/templates/codex-workflow/handoff-summary-template.md` exists and aligns with workflow run/handoff artifact contracts
- [ ] `model-agnostic-workflow-system/examples/codex-workflow/README.md` maps representative examples to workflow class, output contract, and template surfaces
- [ ] `model-agnostic-workflow-system/examples/codex-workflow/handoff-summary-example.md` exists and aligns with workflow run/handoff output contracts
- [ ] `model-agnostic-workflow-system/examples/` contains generic examples
- [ ] `model-agnostic-workflow-system/scripts/tools/` contains the shared validation scripts
- [ ] `model-agnostic-workflow-system/scripts/tools/validate-local-input-contract.mjs` validates consumer-local contracts
- [ ] `model-agnostic-workflow-system/scripts/tools/validate-runtime-policy-input-contract.mjs` validates runtime-policy contracts
- [ ] `model-agnostic-workflow-system/scripts/tools/build-neutral-core-registry.mjs` can regenerate the neutral registry snapshot
- [ ] `model-agnostic-workflow-system/scripts/tools/build-provider-exports.mjs` can regenerate the provider export bundles
- [ ] `model-agnostic-workflow-system/scripts/tools/run-certification-evals.mjs` can run the certification fixtures
- [ ] `model-agnostic-workflow-system/scripts/tools/validate-provider-neutral-core.mjs` validates the neutral registry and provider scaffolds
- [ ] `model-agnostic-workflow-system/scripts/tools/validate-secret-boundaries.mjs` validates secret-boundary metadata, provider security flags, and policy presence
- [ ] `model-agnostic-workflow-system/scripts/tools/scan-secrets.mjs` scans governed surfaces for explicit secret leaks
- [ ] Secret-boundary validation includes leak-scan findings as blocking issues when explicit secret patterns are detected
- [ ] `model-agnostic-workflow-system/scripts/tools/validate-repo-surface.mjs` combines package and neutral-core validation
- [ ] `model-agnostic-workflow-system/scripts/tools/calculate-package-fingerprint.mjs` produces a stable fingerprint
- [ ] Shared skill frontmatter includes the required metadata fields
- [ ] `repo-intake-sot-mapper` declares `input_contract_path` and a `## Local Inputs` section
- [ ] `runtime-policy-auditor` declares `input_contract_path`, `## Local Inputs`, and `## Non-Goals`
- [ ] The local repo package still validates after the scaffold is added
- [ ] The certification eval suite passes after the provider export bundles are regenerated
- [ ] Workflow evidence and provider export alignment eval fixtures pass
- [ ] Workflow routing/template linkage remains consistent across canonical routing map, registry projection, and provider exports
- [ ] Workflow class coverage declarations (`workflowClassCoverage`, `workflowClassCoverageNotes`, `exampleArtifacts`) remain consistent and file-backed
- [ ] Exported skills include derived `workflowSupport` metadata that remains consistent with canonical workflow routing
- [ ] Secret-boundary fixtures pass, including provider-switch re-minimization, trace redaction, and memory rejection cases

## Conditional Checks

Conditional checks are only evaluated when the surface is present or explicitly adopted. Absence is not failure unless the repo is expected to provide the surface.
- The class model in [architecture.md](architecture.md) is logical only; it does not require physical `canonical/`, `operational/`, `derived/`, or `archive` directories.

- [ ] If `/.codex/shared-core-map.json` is present, it is valid JSON
- [ ] If `/.codex/shared-core-map.json` is present, it classifies shared, local, contract-only, and deferred assets explicitly

## Advisory Checks

Advisory items are guidance, not gate failures.

- [ ] Use [maintainer-commands.md](maintainer-commands.md) for command syntax before running helper-only or validator-backed commands manually.
- [ ] Treat catalog `contract-only` and `stub` rows as non-runnable even when the names read like actions.
- [ ] Keep helper-only scripts labeled as helper-only in docs so they do not read like exported product tools.
