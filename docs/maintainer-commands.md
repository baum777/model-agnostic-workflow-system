# Maintainer Commands

Operational command appendix. These are command wrappers, not exported tool declarations. For hierarchy and rules, see [docs/architecture.md](C:/workspace/main_projects/codex-workflow-core/docs/architecture.md) and [docs/usage.md](C:/workspace/main_projects/codex-workflow-core/docs/usage.md).

## Qwen Bootstrap Lifecycle

1. Initialize the consumer-local Qwen bootstrap once.
2. Inspect and customize the overlay locally.
3. Validate the bootstrap after initialization.
4. Revalidate after every local Qwen edit.

The generated `.qwen` tree is a consumer-local scaffold. It is not shared-core runtime authority, and init must not silently overwrite existing local overlay content.

## Refresh a Consumer Lock (helper-only)

```bash
npm run refresh-lock -- --consumer C:/workspace/main_projects/SaaS-Production_workspace/OrchestrAI_Labs
```

Updates the consumer manifest with the current shared-core version and fingerprint.

## Build the Neutral Registry (helper-only)

```bash
npm run build-registry -- --write
```

Regenerates `core/contracts/core-registry.json` and the compatibility mirror in `contracts/core-registry.json` from the current skills, tool catalog, and provider capability profile.

## Build the Provider Exports (helper-only)

```bash
npm run build-exports -- --provider openai
```

Regenerates `providers/<provider>/export.json` from the neutral registry and provider capability profile. Omit `--provider` to rebuild every provider export. Canonical provider names are `openai-codex`, `anthropic-claude`, `qwen-code`, and `kimi-k2_5`.

## Run Certification Evals (validator-backed)

```bash
npm run eval
```

Runs the deterministic certification fixtures in `evals/` against the generated registry and provider export bundles.

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

## Validate a Qwen Bootstrap Overlay (validator-backed)

```bash
npm run validate-qwen-bootstrap -- --consumer C:/workspace/main_projects/dotBot/bobbyExecute
```

Checks the consumer-local `.qwen` scaffold for required settings, extension manifest fields, resource files, agent contracts, skill contracts, and broken references.

## Initialize a Consumer Overlay (initializer/scaffold)

```bash
npm run init-consumer -- --consumer C:/workspace/main_projects/dotBot/bobbyExecute
```

Creates the minimal overlay files and a local validator wrapper if they do not already exist.

## Initialize a Qwen Bootstrap Overlay (initializer/scaffold)

```bash
npm run init-qwen-bootstrap -- --consumer C:/workspace/main_projects/dotBot/bobbyExecute
```

Creates the consumer-local `.qwen` scaffold from the shared template pack. Re-running init is intentionally non-destructive and fails if `.qwen` already exists.

## When to Use These Commands

- use `refresh-lock` for helper-only linkage refreshes
- use `validate-consumer` for validator-backed consumer linkage checks before rollout or review
- use `build-registry` when `core/skills/`, `skills/`, `core/contracts/tool-contracts/catalog.json`, or provider capability profiles change
- use `build-exports` when canonical provider adapter scaffolds or provider capability profiles change
- use `eval` when certification fixtures, registry semantics, or provider export bundles change
- use `validate-neutral` after changing the neutral registry, provider scaffolds, or adapter boundary docs
- use `init-consumer` for the first initializer/scaffold pass in a new repository
- use `validate-input-contract` whenever a consumer adopts `repo-intake-sot-mapper`
- use `validate-runtime-policy-input-contract` whenever a consumer adopts `runtime-policy-auditor`
- use `init-qwen-bootstrap` for the first consumer-local Qwen scaffold pass only
- use `validate-qwen-bootstrap` after generating or editing the consumer-local Qwen scaffold
