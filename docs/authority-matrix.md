# Authority Matrix

Class: canonical.
Use rule: read this as the compact claim/status ledger; use it to separate doc class from enforcement status and to see which surfaces are canonical, operational, derived, or archive.

This file is the canonical authority map for governance, capability, and documentation claims in `model-agnostic-workflow-system`.

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

Capability maturity labels used in prose docs are:

- `prose-governed`
- `contract-backed`
- `validator-backed`
- `runtime-implemented`

These labels describe maturity and evidence shape. They do not replace the claim-status values in this matrix.

The generated `.qwen` scaffold is a consumer-local operating overlay. It is not shared-core authority and not a repo-global enforcement plane. The Qwen bootstrap validator checks bootstrap integrity only; it does not assert canonical runtime truth.

## Extension Module Consolidation Snapshot

| module | canonical surface(s) | maturity | opt-in posture | eval status | runtime status | deferred cross-module checks |
| --- | --- | --- | --- | --- | --- | --- |
| OBS | `core/contracts/observability-spine.json` | `contract-backed` | opt-in via `portable-skill-manifest` moduleContracts | validator-backed candidate via `eval:obs` | Phase 1 local dry-run artifact writer | none in current slice |
| PBC | `core/contracts/permission-boundary.json` | `contract-backed` | opt-in via `portable-skill-manifest` moduleContracts | validator-backed candidate via `eval:pbc` | Phase 1 local dry-run permission gate | `PBC-V03` |
| WMC | `core/contracts/workflow-memory-contract.json` | `contract-backed` | opt-in via `portable-skill-manifest` moduleContracts | validator-backed candidate via `eval:wmc` | loaded by Phase 1 dry-run; memory storage deferred | `WMC-V04` |
| MAHP | `core/contracts/handoff-protocol.json`, `core/contracts/handoff-patterns.json` | `contract-backed` | opt-in via `portable-skill-manifest` moduleContracts | validator-backed candidate via `eval:mahp` | deferred | `MAHP-V05` |
| RGC | `core/contracts/resource-governor.json` | `contract-backed` | opt-in via `portable-skill-manifest` moduleContracts | validator-backed candidate via `eval:rgc` | deferred | `RGC-V01`, `RGC-V02`, `RGC-V03` |
| TSC | `core/contracts/trigger-scheduling.json` | `contract-backed` | opt-in via `portable-skill-manifest` moduleContracts | validator-backed candidate via `eval:tsc` | deferred | `TSC-V05`, `TSC-V06` |

Runtime/enforcement note: Phase 1 adds a local dry-run runtime surface for OBS artifact writing and a PBC deny-by-default permission gate only. Scheduler, memory store, handoff transport/receiver, budget enforcement engine, HTTP service, MCP server, remote queue, and background daemon remain deferred.
For extension-module migration hardening policy and the opt-in-to-blocking transition boundary, see `docs/compatibility.md` -> `0.3.0 Migration Timeline Decision Record`.

| surface | surface kind | doc class | enforcement status | authority / enforcement path | note |
| --- | --- | --- | --- | --- | --- |
| `README.md` | doc | canonical | prose-only | canonical front door by repo convention | shortest practical entrypoint; points to the docs index |
| `WORKFLOW.md` | doc | canonical | prose-only | canonical root workflow contract by repo convention | workflow taxonomy, routing, validation posture, stop conditions, and reporting expectations |
| `docs/README.md` | doc | operational | prose-only | docs navigation hub | index only; links to canonical and operational docs |
| `AGENTS.md` | doc | canonical | prose-only | canonical root operating contract by repo convention | root governance surface |
| `docs/architecture.md` | doc | canonical | prose-only | canonical docs charter by repo convention | defines tiers, merge rules, update rules, and skill topology |
| `docs/authority-matrix.md` | doc | canonical | prose-only | canonical authority ledger by repo convention | records claim status and evidence across surfaces |
| `docs/governance/source-hierarchy.md` | doc | canonical | prose-only | canonical authority-order document by repo convention | maps governance, workflow, skill, tool, MCP, and inference order |
| `docs/mcp/policy.md` | doc | canonical | prose-only | canonical MCP boundary policy by repo convention | MCP posture, modes, non-authority rule, and fail-closed behavior |
| `docs/compatibility.md` | doc | canonical | partly enforced | canonical compatibility governance charter + scaffold heading checks | explicit canonical-vs-compatibility ownership, release-critical audit scope, and bounded certification handoff boundary |
| `docs/usage.md` | doc | operational | prose-only | operational hub | links outward instead of redefining canon |
| `docs/ui-ux-composition-branch.md` | doc | canonical | prose-only | canonical UI/UX branch charter | branch authority, status matrix, and contract boundaries |
| `docs/ui-ux-composition/*` | doc | derived | prose-only | advisory internal branch taxonomy | not a second authority path |
| `evals/README.md` | doc | operational | prose-only | evals entrypoint | certification and parity guide |
| `docs/adoption-playbook.md` | doc | operational | prose-only | operational first-time adoption guidance | bounded consumer init/adoption flow with explicit canonical-vs-compatibility and validator linkage |
| `docs/consumer-rollout-playbook.md` | doc | operational | prose-only | operational rollout guidance | bounded existing-consumer refresh/handoff flow with required regeneration, validation, and eval linkage |
| `docs/maintainer-commands.md` | doc | operational | partly enforced | operational guidance + scaffold heading checks | command appendix including bounded release certification gate flow |
| `docs/validation-checklist.md` | doc | operational | partly enforced | gates reference scripts and validators | includes release-critical audit and certification handoff checks |
| `docs/portability.md` | doc | canonical | prose-only | portability charter | explains core/provider/compatibility boundaries |
| `docs/provider-capability-matrix.md` | doc | canonical | prose-only | provider capability charter | names canonical providers and aliases |
| `docs/authoring-guides.md` | doc | operational | partly enforced | authoring guide + scaffold heading checks | explains safe extension of skills/contracts/templates/examples/policies/exports and links directly to validator gates |
| `docs/secret-handling.md` | doc | canonical | prose-only | canonical secret-boundary charter | single prose authority for secret classes, redaction, memory, and provider-switch posture |
| `docs/overview.md` | doc | derived | prose-only | summary only | should not be read as governing text |
| `docs/eval-baseline.md` | doc | derived | prose-only | derived evidence baseline | not a governance source |
| `docs/extraction-roadmap.md` | doc | archive | prose-only | historical planning record | not live authority |
| `CHANGELOG.md` | doc | archive | prose-only | release history | historical record only |
| `docs/tool-contracts/catalog.json` | config surface | n/a | partly enforced | compatibility/export tool catalog with runnable/helper-only/validator-backed/contract-only/stub labels | compatibility export for the current Codex-oriented tool catalog; not canonical machine-readable tool truth |
| `core/README.md` | doc | canonical | prose-only | portable core index | boundary and layout for the provider-neutral core slice |
| `core/contracts/README.md` | doc | canonical | prose-only | canonical contract index | points at the normalized core contract files |
| `core/contracts/core-registry.json` | config surface | n/a | validator-backed | `scripts/tools/build-neutral-core-registry.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | canonical neutral registry snapshot for skills, workflows, tools, and providers |
| `core/contracts/provider-capabilities.json` | config surface | n/a | validator-backed | `scripts/tools/validate-provider-neutral-core.mjs` + `scripts/tools/validate-secret-boundaries.mjs` | canonical provider capability matrix consumed by the neutral registry builder, including portability-minimized capability states and secret-boundary projection metadata |
| `core/contracts/portable-skill-manifest.json` | config surface | n/a | contract-backed | portable skill discovery contract consumed by neutral registry builder | canonical machine-readable portable skill discovery posture (classification, tool usage posture, MCP posture defaults/overrides, output contract linkage) |
| `core/contracts/observability-spine.json` | config surface | n/a | contract-backed | provider-neutral observability contract surface | canonical event-envelope and provenance-state vocabulary (`observed` vs `inferred`) with fail-closed `BLOCKED` outcome taxonomy; validator-backed candidate via `eval:obs`; runtime wiring deferred |
| `core/contracts/permission-boundary.json` | config surface | n/a | contract-backed | provider-neutral permission contract surface | canonical PBC claim schema for permission categories, scope levels, denied-by-default posture, and optional degraded permissions; validator-backed candidate via `eval:pbc`; runtime wiring deferred |
| `core/contracts/workflow-memory-contract.json` | config surface | n/a | contract-backed | provider-neutral workflow memory contract surface | canonical WMC entry schema for memory scope, writer identity, provenance, ttl, key/value typing, and read access claims; validator-backed candidate via `eval:wmc`; runtime wiring deferred |
| `core/contracts/handoff-protocol.json` | config surface | n/a | contract-backed | provider-neutral MAHP envelope surface | canonical handoff envelope schema for emitter/receiver context, provenance chain, open gaps, acceptance criteria, composition pattern, and fan-out/fan-in grouping; validator-backed candidate via `eval:mahp`; transport/runtime deferred |
| `core/contracts/handoff-patterns.json` | config surface | n/a | contract-backed | provider-neutral MAHP pattern catalog | canonical composition-pattern and MAHP rule catalog; explicitly keeps transport out of scope and authorization in PBC domain |
| `core/contracts/resource-governor.json` | config surface | n/a | contract-backed | provider-neutral RGC contract surface | canonical resource declaration and workflow budget-cap schema for profile hints, retry policy, fallback constraints, and budget-exhaustion behavior claims; validator-backed candidate via `eval:rgc`; budget/runtime enforcement deferred |
| `core/contracts/trigger-scheduling.json` | config surface | n/a | contract-backed | provider-neutral TSC contract surface | canonical trigger/scheduling declaration schema for trigger-type configs, preconditions, and concurrency posture; validator-backed candidate via `eval:tsc`; scheduler/runtime enforcement deferred |
| `core/contracts/output-contracts.json` | config surface | n/a | contract-only | portable output contract catalog | normalized output contract metadata for portable skills and workflow plan/run/validation/certification/handoff artifacts, including recommended template linkage |
| `core/contracts/workflow-routing-map.json` | config surface | n/a | validator-backed | `scripts/tools/build-neutral-core-registry.mjs` + `scripts/tools/validate-provider-neutral-core.mjs` | canonical workflow class mapping to supporting skills, control-plane skills, allowed tools, MCP posture, validation gates, expected output contracts, template linkage, example linkage, and completion evidence posture |
| `core/contracts/tool-contracts/catalog.json` | config surface | n/a | validator-backed | `scripts/tools/validate-provider-neutral-core.mjs` + `scripts/tools/validate-secret-boundaries.mjs` | canonical machine-readable tool catalog with explicit secret-boundary metadata |
| `runtime/cli/runtime-dry-run.mjs` | runnable-tool | n/a | runnable | `npm run runtime:dry-run` | local-only Phase 1 runtime-implemented surface; loads required `core/contracts/*`, writes OBS events, exercises PBC denial, and creates ignored run artifacts |
| `runtime/cli/runtime-validate.mjs` | runnable-tool | n/a | runnable | `npm run runtime:validate -- --latest` or `npm run runtime:validate -- --runId <id>` | validates Phase 1 runtime-implemented run artifacts only; does not validate memory, scheduler, handoff, resource governor, HTTP, MCP, or service mode |
| `runtime/memory/memory-policy.mjs` | validator | n/a | validator-backed | `npm run memory:validate` | validates the Phase 2 memory skeleton structure and disabled-capability posture; does not enable runtime memory writes |
| `runtime/cli/runtime-run.mjs`, `runtime/cli/runtime-status.mjs`, `runtime/cli/runtime-replay.mjs` | runnable-tool | n/a | stub | package scripts exit fail-closed in Phase 1 | reserved for later local runtime slices; current stubs prevent overclaiming unavailable capability |
| `artifacts/runtime-runs/<runId>/` | generated artifact surface | n/a | implemented | created by `npm run runtime:dry-run`; validated by `npm run runtime:validate` | ignored local runtime-implemented evidence containing `manifest.json`, `events.jsonl`, `permissions.jsonl`, and `validation-receipt.json` |
| `policies/secret-classes.yaml` | config surface | n/a | validator-backed | `scripts/tools/validate-secret-boundaries.mjs` | machine-readable secret class policy; not a second prose authority |
| `policies/tool-capabilities.yaml` | config surface | n/a | validator-backed | `scripts/tools/validate-secret-boundaries.mjs` | machine-readable secret-boundary field policy for normalized tool contracts |
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
| `core/skills/ui-to-backend-contract-extractor/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable extraction skill deriving backend/API/state contracts from UI evidence |
| `core/skills/source-conflict-resolver/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable fail-closed conflict resolver across contradictory truth surfaces |
| `core/skills/spec-to-task-breakdown/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable spec operationalization skill with explicit task traceability |
| `core/skills/incident-runbook-composer/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable action-oriented incident and recovery runbook composition skill |
| `core/skills/multi-audience-summarizer/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable audience-bounded summarization skill from one findings body |
| `core/skills/tradeoff-matrix-builder/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable structured tradeoff comparison skill for options, paths, and architectures |
| `core/skills/long-document-to-knowledge-asset/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable document-to-asset skill |
| `core/skills/ui-ux-composition/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | canonical operational skill surface for UI/UX composition plus semantic visual/layout/color/typography posture and bounded golden-ratio guidance |
| `core/skills/static-vs-dynamic-rendering-advisor/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | bounded rendering-posture advisor for `static`, server-rendered dynamic, and hydration decisions |
| `core/skills/secret-boundary-audit/SKILL.md` | shared-exported-skill | n/a | extracted | `core/contracts/portable-skill-manifest.json` | portable audit skill for secret-bearing boundaries, provider switches, trace redaction, and memory persistence |
| `providers/README.md` | doc | operational | prose-only | provider adapter index | adapter boundary, not canonical truth |
| `docs/workflows/README.md` | doc | canonical | prose-only | canonical workflow deep-dive entrypoint by repo convention | extends class-level workflow mapping context while preserving `WORKFLOW.md` as root taxonomy authority |
| `docs/workflows/implementation-and-handoff.md` | doc | canonical | prose-only | canonical workflow class deep dive by repo convention | implementation and migration execution/handoff posture aligned to routing map, output contracts, and templates |
| `docs/workflows/verification-and-certification.md` | doc | canonical | prose-only | canonical workflow class deep dive by repo convention | verification/release certification posture aligned to routing map, output contracts, and eval gates |
| `templates/codex-workflow/README.md` | doc | operational | prose-only | canonical template index by repo convention | maps task/review/handoff templates to workflow classes and output contracts without replacing machine-readable truth |
| `examples/codex-workflow/README.md` | doc | derived | prose-only | derived example index by repo convention | maps representative planning/review/handoff examples to canonical workflow/output/template surfaces |
| `repo-root mcp/` | repo surface | n/a | missing | no observed canonical top-level MCP directory | MCP canon for this slice lives in `docs/mcp/policy.md` |
| `repo-root tools/` | repo surface | n/a | missing | no observed canonical top-level tools directory | canonical machine-readable tool truth lives in `core/contracts/tool-contracts/catalog.json` |
| `repo-root memory/` | repo surface | n/a | validator-backed | `npm run memory:validate` | Phase 2 non-canonical memory skeleton only; runtime memory writes, automatic canonical promotion, SQLite, scheduler, and remote memory remain disabled |
| `scripts/tools/validate-shared-core-package.mjs` | validator | n/a | validator-backed | package and plugin validator | validates package metadata, plugin name/version/skills path |
| `scripts/tools/validate-shared-core-scaffold.mjs` | validator | n/a | validator-backed | scaffold validator | validates required files/dirs and shared skill contract sections |
| `scripts/tools/build-neutral-core-registry.mjs` | helper-script | n/a | helper-only | neutral registry generator | writes or prints the provider-neutral registry snapshot |
| `scripts/tools/build-provider-exports.mjs` | helper-script | n/a | helper-only | provider export generator | writes or prints provider export bundles from the neutral registry |
| `scripts/tools/run-certification-evals.mjs` | validator | n/a | validator-backed | certification eval runner | runs deterministic fixture-backed certification checks |
| `scripts/tools/validate-provider-neutral-core.mjs` | validator | n/a | validator-backed | neutral registry validator | checks registry, provider scaffolds, and capability profiles |
| `scripts/tools/validate-secret-boundaries.mjs` | validator | n/a | validator-backed | secret-boundary validator | checks canonical secret policy presence, normalized tool metadata, provider security flags, provider export secret metadata, and blocking leak-scan findings |
| `scripts/tools/scan-secrets.mjs` | validator | n/a | validator-backed | secret leak scanner | scans governed docs, examples, templates, evals, and env-like files for explicit leak patterns |
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
| `.agents/skills/skill-tool-mcp-builder/SKILL.md` | repo-local-control-skill | n/a | active | `.agents/skills/skill-tool-mcp-builder/SKILL.md` | classifies loose requests into surface type decisions only |
| `.agents/skills/skill-creator-orchestrator/SKILL.md` | repo-local-control-skill | n/a | active | `.agents/skills/skill-creator-orchestrator/SKILL.md` | governs reuse, extension, or creation only |
