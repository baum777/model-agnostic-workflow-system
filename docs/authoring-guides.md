# Authoring Guides

Class: operational.
Use rule: use this as the default extension path for skills/contracts/templates/examples/policies/exports; canonical ownership remains in machine-readable contracts and validators.

## Canonical Ownership First

1. Update canonical machine-readable truth first under `core/contracts/` and `policies/` when semantics change.
2. Treat `contracts/`, `skills/`, `providers/*/export.json`, and `docs/tool-contracts/catalog.json` as compatibility/export surfaces unless `docs/authority-matrix.md` marks them canonical.
3. Do not introduce provider-specific semantics into canonical shared-core contracts when a portable normalized field already exists.
4. Keep runtime claims fail-closed: this repo is artifact/validator oriented and does not claim a runtime workflow control plane or runtime memory subsystem.

## Skill Authoring

1. Put portable skills in `core/skills/`.
2. Declare portable identity and output contract paths in frontmatter.
3. Keep frontmatter aligned to `core/contracts/portable-skill-manifest.json` and `core/contracts/core-registry.json` projection fields.
4. Add explicit `## Tool Requirements`, `## Approval Mode`, `## Provider Projections`, and `## Eval Scaffolding` sections.
5. Add exact `## Output` bullet headings that can be projected into `outputHeadings` and validated.
6. Keep provider-specific behavior out of the skill body.
7. Run `npm run validate-neutral` and `npm run eval` after changes that affect skill metadata or workflow linkage.

## Workflow/Output/Template Authoring

1. Keep workflow mapping canonical in `core/contracts/workflow-routing-map.json`.
2. Keep artifact contract truth canonical in `core/contracts/output-contracts.json`.
3. Keep template mapping aligned to workflow/output contracts in `templates/codex-workflow/README.md`.
4. Keep example mapping derived and bounded in `examples/codex-workflow/README.md`; examples must not become authority surfaces.
5. Prefer extending existing templates/examples over adding broad new families.

## Tool Contract Authoring

1. Put normalized tool contracts in `core/contracts/tool-contracts/catalog.json`.
2. Include `tool_name`, `intent_class`, `schema`, `side_effects`, `approval_required`, `mcp_compatible`, `providers`, and `routing_hints`.
3. Also include the canonical secret-boundary fields defined in `policies/tool-capabilities.yaml`, even when the tool does not require secrets.
4. Use explicit safe defaults for non-secret tools instead of leaving boundary fields implicit.
5. Keep compatibility mirrors in the legacy `docs/tool-contracts/catalog.json` only when needed.

## Secret Boundary Authoring

1. Keep prose authority in `docs/secret-handling.md`.
2. Keep machine-readable secret class and tool capability policy in `policies/`.
3. Treat provider security objects as projection metadata, not policy origins.
4. Add fixture-backed pass and fail cases for secret-boundary rules in `evals/fixtures/`.
5. Do not place literal secrets in docs, examples, templates, or eval payloads.

## Provider Capability And Export Authoring

1. Regenerate the neutral registry with `npm run build-registry`.
2. Regenerate canonical provider exports with `npm run build-exports`.
3. Confirm provider export capability and source-contract metadata remain derived from `core/contracts/*` and `policies/*`.
4. Keep `providers/*/export.json` as projection artifacts, not independent authority.

## Required Validation Gate

1. `npm run validate`
2. `npm run validate-neutral`
3. `npm run eval`
4. Treat failures as blocking until resolved or explicitly classified as unrelated pre-existing state.

## Eval Authoring

1. Add fixture files under `evals/fixtures/`.
2. Register them in `evals/catalog.json`.
3. Prefer fail-closed checks that compare declared metadata rather than narrative summaries.

## Drift Prevention Rules

1. Do not add a second canonical home for workflow, tool, output, provider capability, or policy semantics.
2. Keep guidance prose linked to the enforcing scripts in `scripts/tools/`.
3. Preserve compatibility mirrors explicitly; do not silently promote mirrors to canonical authority.
4. Keep `repo-root memory/` planned/prose-governed unless concrete validator-backed machinery exists.

## Maturity Posture

- `prose-governed`: this authoring guide and entrypoint guidance.
- `contract-backed`: canonical contracts in `core/contracts/*` and policies in `policies/*`.
- `validator-backed`: `scripts/tools/validate-shared-core-scaffold.mjs`, `scripts/tools/validate-provider-neutral-core.mjs`, `scripts/tools/validate-secret-boundaries.mjs`.
- `runtime-implemented`: bounded to actual scripts/artifacts; no runtime workflow engine, no runtime memory subsystem, and no live MCP mesh claimed.
