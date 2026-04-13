# Authority Matrix

Class: canonical.
Use rule: read this as the compact claim/status ledger; use it to separate doc class from enforcement status and to see which surfaces are canonical, operational, derived, or archive.

This file is the canonical authority map for governance, capability, and documentation claims in `codex-workflow-core`.

Status values:

- `implemented`: enforced by an observed script/tool path
- `contract-only`: documented instruction contract without script enforcement
- `planned`: explicitly referenced future surface, not implemented yet
- `missing`: no enforcing surface observed
- `unclear`: conflicting or incomplete authority signals

For documentation surfaces, doc class and enforcement status are different fields. Class says what the doc is; enforcement status says whether a script or validator backs the claim.
For non-document surfaces, doc class is `n/a` and surface kind carries the distinction.
Skill surfaces are classified separately as `shared-exported-skill`, `contract-bound-skill`, or `repo-local-control-skill`.
Tool surfaces in this matrix use `runnable`, `validator-backed`, `helper-only`, `contract-only`, `stub`, or `planned` in the enforcement status column. Documentation surfaces keep their prose/status language.

The generated `.qwen` scaffold is a consumer-local operating overlay. It is not shared-core authority and not a repo-global enforcement plane. The Qwen bootstrap validator checks bootstrap integrity only; it does not assert canonical runtime truth.

| surface | surface kind | doc class | enforcement status | authority / enforcement path | note |
| --- | --- | --- | --- | --- | --- |
| `README.md` | doc | canonical | prose-only | canonical front door by repo convention | shortest practical entrypoint; points to the docs index |
| `docs/README.md` | doc | operational | prose-only | docs navigation hub | index only; links to canonical and operational docs |
| `AGENTS.md` | doc | canonical | prose-only | canonical root operating contract by repo convention | root governance surface |
| `docs/architecture.md` | doc | canonical | prose-only | canonical docs charter by repo convention | defines tiers, merge rules, update rules, and skill topology |
| `docs/authority-matrix.md` | doc | canonical | prose-only | canonical authority ledger by repo convention | records claim status and evidence across surfaces |
| `docs/usage.md` | doc | operational | prose-only | operational hub | links outward instead of redefining canon |
| `evals/README.md` | doc | operational | prose-only | evals entrypoint | certification and parity guide |
| `docs/adoption-playbook.md` | doc | operational | prose-only | operational guidance | first-time setup only |
| `docs/consumer-rollout-playbook.md` | doc | operational | prose-only | operational guidance | existing consumer refresh and rollout only |
| `docs/maintainer-commands.md` | doc | operational | prose-only | operational guidance | command appendix only |
| `docs/validation-checklist.md` | doc | operational | partly enforced | gates reference scripts and validators | conditional items remain conditional |
| `docs/portability.md` | doc | canonical | prose-only | portability charter | explains core/provider/compatibility boundaries |
| `docs/provider-capability-matrix.md` | doc | canonical | prose-only | provider capability charter | names canonical providers and aliases |
| `docs/authoring-guides.md` | doc | operational | prose-only | authoring guide | explains how to author skills, tools, exports, and eval fixtures |
| `docs/overview.md` | doc | derived | prose-only | summary only | should not be read as governing text |
| `docs/eval-baseline.md` | doc | derived | prose-only | derived evidence baseline | not a governance source |
| `docs/extraction-roadmap.md` | doc | archive | prose-only | historical planning record | not live authority |
| `CHANGELOG.md` | doc | archive | prose-only | release history | historical record only |
| `docs/tool-contracts/catalog.json` | config surface | n/a | partly enforced | tool catalog with runnable/helper-only/validator-backed/contract-only/stub labels | compatibility export for the current Codex-oriented tool catalog |
| `core/README.md` | doc | canonical | prose-only | portable core index | boundary and layout for the provider-neutral core slice |
| `core/contracts/README.md` | doc | canonical | prose-only | canonical contract index | points at the normalized core contract files |
| `core/contracts/core-registry.json` | config surface | n/a | validator-backed | `scripts/tools/build-neutral-core-registry.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | canonical neutral registry snapshot for skills, tools, and providers |
| `core/contracts/provider-capabilities.json` | config surface | n/a | validator-backed | `scripts/tools/validate-provider-neutral-core.mjs` | canonical provider capability matrix consumed by the neutral registry builder |
| `core/contracts/output-contracts.json` | config surface | n/a | contract-only | portable output contract catalog | normalized output contract metadata for portable skills |
| `core/contracts/tool-contracts/catalog.json` | config surface | n/a | contract-only | portable tool contract catalog | normalized tool contract metadata for portable skills |
| `contracts/core-registry.json` | config surface | n/a | compatibility mirror | `scripts/tools/build-neutral-core-registry.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | legacy mirror of the canonical registry |
| `contracts/provider-capabilities.json` | config surface | n/a | compatibility mirror | `scripts/tools/build-neutral-core-registry.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | legacy mirror of the canonical provider capability matrix |
| `evals/catalog.json` | config surface | n/a | validator-backed | `scripts/tools/run-certification-evals.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | fixture index for deterministic certification checks |
| `providers/openai-codex/export.json` | config surface | n/a | validator-backed | `scripts/tools/build-provider-exports.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | generated canonical OpenAI-Codex provider export bundle |
| `providers/anthropic-claude/export.json` | config surface | n/a | validator-backed | `scripts/tools/build-provider-exports.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | generated canonical Claude provider export bundle |
| `providers/qwen-code/export.json` | config surface | n/a | validator-backed | `scripts/tools/build-provider-exports.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | generated canonical Qwen Code provider export bundle |
| `providers/kimi-k2_5/export.json` | config surface | n/a | validator-backed | `scripts/tools/build-provider-exports.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | generated canonical Kimi K2.5 provider export bundle |
| `providers/openai/export.json` | config surface | n/a | compatibility mirror | `scripts/tools/build-provider-exports.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | legacy OpenAI/Codex compatibility export bundle |
| `providers/anthropic/export.json` | config surface | n/a | compatibility mirror | `scripts/tools/build-provider-exports.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | legacy Anthropic compatibility export bundle |
| `providers/qwen/export.json` | config surface | n/a | compatibility mirror | `scripts/tools/build-provider-exports.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | legacy Qwen compatibility export bundle |
| `providers/kimi/export.json` | config surface | n/a | compatibility mirror | `scripts/tools/build-provider-exports.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | legacy Kimi compatibility export bundle |
| `providers/codex/export.json` | config surface | n/a | compatibility mirror | `scripts/tools/build-provider-exports.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | legacy Codex compatibility export bundle |
| `core/skills/repo-audit/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable repo audit skill |
| `core/skills/readiness-check/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable readiness gate skill |
| `core/skills/supabase-deployment/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable Supabase deployment skill with fail-closed remote-state gates |
| `core/skills/neon-db-setup/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable Neon Postgres setup and validation skill |
| `core/skills/migration-planner/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable migration planning skill |
| `core/skills/research-synthesis/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable research synthesis skill |
| `core/skills/long-document-to-knowledge-asset/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable document-to-asset skill |
| `providers/README.md` | doc | operational | prose-only | provider adapter index | adapter boundary, not canonical truth |
| `scripts/tools/validate-shared-core-package.mjs` | validator | n/a | validator-backed | package and plugin validator | validates package metadata, plugin name/version/skills path |
| `scripts/tools/validate-shared-core-scaffold.mjs` | validator | n/a | validator-backed | scaffold validator | validates required files/dirs and shared skill contract sections |
| `scripts/tools/build-neutral-core-registry.mjs` | helper-script | n/a | helper-only | neutral registry generator | writes or prints the provider-neutral registry snapshot |
| `scripts/tools/build-provider-exports.mjs` | helper-script | n/a | helper-only | provider export generator | writes or prints provider export bundles from the neutral registry |
| `scripts/tools/run-certification-evals.mjs` | validator | n/a | validator-backed | certification eval runner | runs deterministic fixture-backed certification checks |
| `scripts/tools/validate-provider-neutral-core.mjs` | validator | n/a | validator-backed | neutral registry validator | checks registry, provider scaffolds, and capability profiles |
| `scripts/tools/validate-repo-surface.mjs` | validator | n/a | validator-backed | repo-surface validator | combined package and provider-neutral validation entrypoint |
| `scripts/tools/validate-consumer-linkage.mjs` | validator | n/a | validator-backed | linkage validator | validates shared source, version/fingerprint, overlay files, adopted skills |
| `scripts/tools/validate-local-input-contract.mjs` | validator | n/a | validator-backed | contract validator | fail-closed on missing/invalid `.codex/repo-intake-inputs.json` |
| `scripts/tools/validate-runtime-policy-input-contract.mjs` | validator | n/a | validator-backed | contract validator | fail-closed on missing/invalid `.codex/runtime-policy-inputs.json` |
| `scripts/tools/spec-compliance-checker.mjs` | validator | n/a | validator-backed | `scripts/tools/spec-compliance-checker.mjs` | heading/marker compliance checker; real validator-like CLI; not package-script surfaced |
| `scripts/tools/approval-gated-write-executor.mjs` | runnable-tool | n/a | runnable | `scripts/tools/approval-gated-write-executor.mjs` | canonical write surface; catalog alias exists under `patch-applicator-with-review-gate` |
| `scripts/tools/init-consumer-overlay.mjs` | initializer/scaffold-script | n/a | runnable | `package.json` `init-consumer` → `scripts/tools/init-consumer-overlay.mjs` | consumer overlay initializer; scaffold-oriented command wrapper |
| `scripts/tools/init-qwen-bootstrap.mjs` | initializer/scaffold-script | n/a | runnable | `package.json` `init-qwen-bootstrap` → `scripts/tools/init-qwen-bootstrap.mjs` | consumer-local Qwen bootstrap initializer; fails closed if `.qwen` already exists |
| `scripts/tools/validate-qwen-bootstrap.mjs` | validator | n/a | validator-backed | `package.json` `validate-qwen-bootstrap` → `scripts/tools/validate-qwen-bootstrap.mjs` | validates the consumer-local `.qwen` bootstrap integrity contract only |
| `scripts/tools/refresh-consumer-lock.mjs` | helper-script | n/a | helper-only | `package.json` `refresh-lock` → `scripts/tools/refresh-consumer-lock.mjs` | maintenance helper, not user-facing |
| `scripts/tools/calculate-package-fingerprint.mjs` | helper-script | n/a | helper-only | `package.json` `fingerprint` → `scripts/tools/calculate-package-fingerprint.mjs` | support utility, not a user-facing tool |
| `scripts/tools/repo-structure-scanner.mjs` | helper-script | n/a | helper-only | `package.json` `scan` → `scripts/tools/repo-structure-scanner.mjs` | analysis helper, not a product tool |
| `scripts/tools/git-diff-explainer.mjs` | helper-script | n/a | helper-only | `package.json` `diff` → `scripts/tools/git-diff-explainer.mjs` | analysis helper, not a product tool |
| `skills/implementation-contract-extractor/SKILL.md` | shared-exported-skill | n/a | extracted | `skills/implementation-contract-extractor/SKILL.md` | generic contract extraction primitive |
| `skills/mcp-server-creation/SKILL.md` | shared-exported-skill | n/a | extracted | `skills/mcp-server-creation/SKILL.md` | broad scaffold/initializer; keep triggers narrow |
| `skills/patch-strategy-designer/SKILL.md` | shared-exported-skill | n/a | extracted | `skills/patch-strategy-designer/SKILL.md` | smallest-safe-change selector |
| `skills/planning-slice-builder/SKILL.md` | shared-exported-skill | n/a | extracted | `skills/planning-slice-builder/SKILL.md` | implementation-wave planner |
| `skills/post-implementation-review-writer/SKILL.md` | shared-exported-skill | n/a | extracted | `skills/post-implementation-review-writer/SKILL.md` | evidence-grounded review writer |
| `skills/release-narrative-builder/SKILL.md` | shared-exported-skill | n/a | extracted | `skills/release-narrative-builder/SKILL.md` | stakeholder narrative writer |
| `skills/repo-intake-sot-mapper/SKILL.md` | contract-bound-skill | n/a | extracted | `skills/repo-intake-sot-mapper/SKILL.md` + `.codex/repo-intake-inputs.json` | requires the declared repo-intake contract |
| `skills/runtime-policy-auditor/SKILL.md` | contract-bound-skill | n/a | extracted | `skills/runtime-policy-auditor/SKILL.md` + `.codex/runtime-policy-inputs.json` | requires the declared runtime-policy contract |
| `skills/test-matrix-builder/SKILL.md` | shared-exported-skill | n/a | extracted | `skills/test-matrix-builder/SKILL.md` | verification coverage planner |
| `skills/vercel-deployment/SKILL.md` | shared-exported-skill | n/a | extracted | `skills/vercel-deployment/SKILL.md` | Vercel deployment workflow skill for Next.js/Node repos; guidance only, not enforcement-backed |
| `.agents/skills/workflow-core-router/SKILL.md` | repo-local-control-skill | n/a | active | `.agents/skills/workflow-core-router/SKILL.md` | selects the primary artifact shape only |
| `.agents/skills/skill-creator-orchestrator/SKILL.md` | repo-local-control-skill | n/a | active | `.agents/skills/skill-creator-orchestrator/SKILL.md` | governs reuse, extension, or creation only |
