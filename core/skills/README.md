# Core Skills

Portable skill slice.

## Canonical Skills

- `repo-audit`
- `readiness-check`
- `supabase-deployment`
- `migration-planner`
- `research-synthesis`
- `ui-to-backend-contract-extractor`
- `source-conflict-resolver`
- `spec-to-task-breakdown`
- `incident-runbook-composer`
- `multi-audience-summarizer`
- `tradeoff-matrix-builder`
- `long-document-to-knowledge-asset`
- `ui-ux-composition`
- `static-vs-dynamic-rendering-advisor`
- `secret-boundary-audit`

## Safe Extension Flow

1. Add or update `core/skills/<skill-id>/SKILL.md` with required frontmatter and required sections.
2. Keep workflow/tool/output linkage machine-readable through `core/contracts/portable-skill-manifest.json`, `core/contracts/workflow-routing-map.json`, and `core/contracts/output-contracts.json`.
3. Keep provider-specific behavior out of portable skill bodies; provider differences belong in derived provider exports.
4. Validate with `npm run validate`, `npm run validate-neutral`, and `npm run eval`.

## Compatibility Rule

- top-level `skills/` remains a compatibility surface for the older shared-core layout.
- new portable skills should be authored here first, then projected into registry/provider exports.
- compatibility skill mirrors must not introduce canonical truth that is missing from this directory and `core/contracts/*`.

## Maturity Posture

- `prose-governed`: this index and authoring flow.
- `contract-backed`: skill metadata contracts and workflow/output mapping contracts in `core/contracts/*`.
- `validator-backed`: `scripts/tools/validate-shared-core-scaffold.mjs` and `scripts/tools/validate-provider-neutral-core.mjs`.
- `runtime-implemented`: bounded to scripts that build/validate registry and exports from these skill sources.
