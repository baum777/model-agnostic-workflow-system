# Core

Canonical portable workflow slice.

## What Lives Here

- portable skills under `core/skills/`
- canonical UI/UX composition branch skill surface under `core/skills/ui-ux-composition/`
- normalized output contracts under `core/contracts/output-contracts.json`
- normalized tool contracts under `core/contracts/tool-contracts/catalog.json`
- canonical provider capability data under `core/contracts/provider-capabilities.json`
- portable core bundle metadata under `core/contracts/portable-skill-manifest.json`
- canonical secret-boundary policy under `../docs/secret-handling.md` and `../policies/`
- eval scaffolding and core boundary notes under `core/evals/`
- overlay boundary notes under `core/overlays/`
- branch charter under `docs/ui-ux-composition-branch.md`
- advisory internal branch taxonomy under `docs/ui-ux-composition/`

## Boundary Rule

- `core/` is the provider-neutral source slice.
- top-level `skills/`, `contracts/`, `docs/tool-contracts/`, and `providers/<legacy>/` remain compatibility surfaces until the migration is complete.
- provider-specific packaging must stay out of the portable core.
