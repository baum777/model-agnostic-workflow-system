# Maintainer Commands

Operational command appendix. These are command wrappers, not exported tool declarations. For hierarchy and rules, see [docs/architecture.md](C:/workspace/main_projects/codex-workflow-core/docs/architecture.md) and [docs/usage.md](C:/workspace/main_projects/codex-workflow-core/docs/usage.md).

## Refresh a Consumer Lock (helper-only)

```bash
npm run refresh-lock -- --consumer C:/workspace/main_projects/SaaS-Production_workspace/OrchestrAI_Labs
```

Updates the consumer manifest with the current shared-core version and fingerprint.

## Build the Neutral Registry (helper-only)

```bash
npm run build-registry -- --write
```

Regenerates `contracts/core-registry.json` from the current skills, tool catalog, and provider capability profile.

## Validate a Consumer (validator-backed)

```bash
npm run validate-consumer -- --consumer C:/workspace/main_projects/SaaS-Production_workspace/OrchestrAI_Labs
```

Checks the consumer manifest, shared-core path, version, fingerprint, adopted skills, and local overlay files.

## Validate the Neutral Core (validator-backed)

```bash
npm run validate-neutral
```

Checks the neutral registry, provider capability profile, provider adapter scaffolds, and registry/tool consistency.

## Validate a Local Input Contract (validator-backed)

```bash
npm run validate-input-contract -- --contract C:/workspace/main_projects/SaaS-Production_workspace/OrchestrAI_Labs/.codex/repo-intake-inputs.json
```

Confirms that a shared-with-local-inputs skill has the repo-local source declarations it needs.

## Validate a Runtime Policy Contract (validator-backed)

```bash
npm run validate-runtime-policy-input-contract -- --contract C:/workspace/main_projects/SaaS-Production_workspace/OrchestrAI_Labs/.codex/runtime-policy-inputs.json
```

Confirms that `runtime-policy-auditor` only reads the runtime policy surfaces the consumer repo explicitly declared.

## Initialize a Consumer Overlay (initializer/scaffold)

```bash
npm run init-consumer -- --consumer C:/workspace/main_projects/dotBot/bobbyExecute
```

Creates the minimal overlay files and a local validator wrapper if they do not already exist.

## When to Use These Commands

- use `refresh-lock` for helper-only linkage refreshes
- use `validate-consumer` for validator-backed consumer linkage checks before rollout or review
- use `build-registry` when `skills/`, `docs/tool-contracts/catalog.json`, or provider capability profiles change
- use `validate-neutral` after changing the neutral registry, provider scaffolds, or adapter boundary docs
- use `init-consumer` for the first initializer/scaffold pass in a new repository
- use `validate-input-contract` whenever a consumer adopts `repo-intake-sot-mapper`
- use `validate-runtime-policy-input-contract` whenever a consumer adopts `runtime-policy-auditor`
