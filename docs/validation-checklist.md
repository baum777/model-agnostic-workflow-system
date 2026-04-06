# Shared Core Validation Checklist

## Repo-local mandatory checks

- [ ] `codex-workflow-core/package.json` exists
- [ ] `codex-workflow-core/package.json` declares version `0.1.4`
- [ ] `codex-workflow-core/CHANGELOG.md` contains the release entry for `0.1.4`
- [ ] `codex-workflow-core/.codex-plugin/plugin.json` exists and matches the package version
- [ ] `codex-workflow-core/docs/` contains the shared-core docs
- [ ] `codex-workflow-core/skills/` contains the mirrored shared skills
- [ ] `codex-workflow-core/skills/repo-intake-sot-mapper/SKILL.md` is classified as `shared-with-local-inputs`
- [ ] `codex-workflow-core/skills/runtime-policy-auditor/SKILL.md` is classified as `shared-with-local-inputs`
- [ ] `codex-workflow-core/docs/shared-with-local-inputs.md` documents the local-input pattern
- [ ] `codex-workflow-core/docs/repo-intake-skill-contract.md` documents the contract shape
- [ ] `codex-workflow-core/docs/runtime-policy-skill-contract.md` documents the runtime-policy contract shape
- [ ] `codex-workflow-core/templates/` contains the shared templates
- [ ] `codex-workflow-core/examples/` contains generic examples
- [ ] `codex-workflow-core/scripts/tools/` contains the shared validation scripts
- [ ] `codex-workflow-core/scripts/tools/validate-local-input-contract.mjs` validates consumer-local contracts
- [ ] `codex-workflow-core/scripts/tools/validate-runtime-policy-input-contract.mjs` validates runtime-policy contracts
- [ ] `codex-workflow-core/scripts/tools/calculate-package-fingerprint.mjs` produces a stable fingerprint
- [ ] Shared skill frontmatter includes the required metadata fields
- [ ] `repo-intake-sot-mapper` declares `input_contract_path` and a `## Local Inputs` section
- [ ] `runtime-policy-auditor` declares `input_contract_path`, `## Local Inputs`, and `## Non-Goals`
- [ ] The local repo package still validates after the scaffold is added

## Conditional checks (consumer-context or optional surfaces)

- [ ] If `/.codex/shared-core-map.json` is present, it is valid JSON
- [ ] If `/.codex/shared-core-map.json` is present, it classifies shared, local, contract-only, and deferred assets explicitly
