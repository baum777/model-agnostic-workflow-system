# Maintainer Commands

Operational command appendix. For hierarchy and rules, see [docs/architecture.md](C:/workspace/main_projects/codex-workflow-core/docs/architecture.md) and [docs/usage.md](C:/workspace/main_projects/codex-workflow-core/docs/usage.md).

## Refresh a Consumer Lock

```bash
npm run refresh-lock -- --consumer C:/workspace/main_projects/SaaS-Production_workspace/OrchestrAI_Labs
```

Updates the consumer manifest with the current shared-core version and fingerprint.

## Validate a Consumer

```bash
npm run validate-consumer -- --consumer C:/workspace/main_projects/SaaS-Production_workspace/OrchestrAI_Labs
```

Checks the consumer manifest, shared-core path, version, fingerprint, adopted skills, and local overlay files.

## Validate a Local Input Contract

```bash
npm run validate-input-contract -- --contract C:/workspace/main_projects/SaaS-Production_workspace/OrchestrAI_Labs/.codex/repo-intake-inputs.json
```

Confirms that a shared-with-local-inputs skill has the repo-local source declarations it needs.

## Validate a Runtime Policy Contract

```bash
npm run validate-runtime-policy-input-contract -- --contract C:/workspace/main_projects/SaaS-Production_workspace/OrchestrAI_Labs/.codex/runtime-policy-inputs.json
```

Confirms that `runtime-policy-auditor` only reads the runtime policy surfaces the consumer repo explicitly declared.

## Initialize a Consumer Overlay

```bash
npm run init-consumer -- --consumer C:/workspace/main_projects/dotBot/bobbyExecute
```

Creates the minimal overlay files and a local validator wrapper if they do not already exist.

## When to Use These Commands

- use `refresh-lock` after any shared-core update
- use `validate-consumer` before rollout or review
- use `init-consumer` for the first adoption in a new repository
- use `validate-input-contract` whenever a consumer adopts `repo-intake-sot-mapper`
- use `validate-runtime-policy-input-contract` whenever a consumer adopts `runtime-policy-auditor`
