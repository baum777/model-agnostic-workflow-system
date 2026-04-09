# Compatibility

The shared core uses a small compatibility contract so consumer repositories can adopt it without guessing.

## Versioning

- Core package version: semver
- Overlay schema version: semver
- Skill metadata version: semver
- Consumer lock metadata: package version plus package fingerprint

Breaking changes require a version bump and a compatibility note.

## Skill Metadata Standard

Every shared-core skill must declare:

- `name`
- `description`
- `version`
- `classification`
- `requires_repo_inputs`
- `produces_structured_output`
- `safe_to_auto_run`
- `owner`
- `status`

## Provider-Neutral Registry

The repository now carries a machine-readable registry in `contracts/core-registry.json`.
That registry is the canonical snapshot for:

- core identity and compatibility exports
- provider-neutral skill records
- tool contract records
- provider capability profiles

The compatibility export in `docs/tool-contracts/catalog.json` remains available for current Codex-oriented consumers, but it is now a compatibility view rather than the only registry surface.

Recommended values:

- `classification`: `shared` or `shared-with-local-inputs`
- `owner`: `codex-workflow-core`
- `status`: `extracted`

## Supported Behavior

- read-only analysis is preferred
- write paths must stay approval-gated
- output should use stable headings
- repo-specific context must flow in through explicit overlay inputs

## Compatibility Rule

If the shared core needs hidden repo assumptions, the asset is not compatible yet.
