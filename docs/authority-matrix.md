# Authority Matrix

This file is the canonical authority map for governance and capability claims in `codex-workflow-core`.

Status values:

- `implemented`: enforced by an observed script/tool path
- `contract-only`: documented instruction contract without script enforcement
- `planned`: explicitly referenced future surface, not implemented yet
- `missing`: no enforcing surface observed
- `unclear`: conflicting or incomplete authority signals

| claim | authority | status | evidence note |
| --- | --- | --- | --- |
| shared-core package and plugin parity | `scripts/tools/validate-shared-core-package.mjs` | implemented | validates package metadata, plugin name/version/skills path |
| shared scaffold required files, skill metadata, and section markers | `scripts/tools/validate-shared-core-scaffold.mjs` | implemented | validates required files/dirs and shared skill contract sections |
| consumer linkage correctness and adopted skill existence | `scripts/tools/validate-consumer-linkage.mjs` | implemented | validates shared source, version/fingerprint, overlay files, adopted skills |
| repo-intake local contract gating | `scripts/tools/validate-local-input-contract.mjs` | implemented | fail-closed on missing/invalid `.codex/repo-intake-inputs.json` |
| runtime-policy local contract gating | `scripts/tools/validate-runtime-policy-input-contract.mjs` | implemented | fail-closed on missing/invalid `.codex/runtime-policy-inputs.json` |
| workflow artifact routing logic | `.agents/skills/workflow-core-router/SKILL.md` | contract-only | routing rules are defined in instruction text, not script-validated |
| root governance/output contract | `AGENTS.md` | contract-only | policy and output contract are instruction-level |
| tool catalog field/schema integrity | `scripts/tools/validate-shared-core-scaffold.mjs` + `docs/tool-contracts/catalog.json` | implemented | validates tool count and required per-tool fields |
| per-tool runtime executability checks for full catalog | none observed | missing | no validator currently checks every tool entrypoint resolves and runs |
| contract and stub catalog entries | `docs/tool-contracts/catalog.json` | contract-only / planned | non-runnable declaration surfaces by status |
| `.codex/shared-core-map.json` requirement | `docs/validation-checklist.md` vs `scripts/tools/validate-shared-core-scaffold.mjs` | unclear | checklist wording can imply required; validator treats as conditional if present |
| `paper-to-live-readiness-reviewer`, `journal-to-learning-extractor` | `scripts/tools/init-consumer-overlay.mjs` | planned | listed as deferred consumer skills; manifests absent in `skills/` |
