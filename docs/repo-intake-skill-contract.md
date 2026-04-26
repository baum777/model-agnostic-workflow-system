# Repo Intake Skill Contract

The `repo-intake-sot-mapper` skill uses a consumer-local contract file to avoid guessing at repository truth.

## Required File

- `.codex/repo-intake-inputs.json`

## Required Fields

- `skill`
- `repoRoot`
- `canonicalSourceFiles`
- `primaryDocs`
- `governanceFiles`
- `likelyEntrypoints`
- `testCommands`
- `ignorePaths`
- `notes`

## Optional Fields

- `journalPaths`
- `dailyNotePaths`
- `evidenceLogPaths`

## Contract Rules

- `skill` must be `repo-intake-sot-mapper`
- `repoRoot` must be `.` so the contract stays consumer-local
- all array fields must contain strings
- `canonicalSourceFiles`, `primaryDocs`, `governanceFiles`, `likelyEntrypoints`, `testCommands`, and `ignorePaths` must be non-empty
- `ignorePaths` must include `.git`, `node_modules`, `dist`, and `coverage`
- `journalPaths`, `dailyNotePaths`, and `evidenceLogPaths` are optional; when provided, each must be a non-empty array of strings
- any provided path in `journalPaths`, `dailyNotePaths`, and `evidenceLogPaths` must exist in the consumer repo

## Purpose

The contract tells the shared skill where to look for canonical source documents, governance files, likely entrypoints, test commands, and optional journal/daily/evidence surfaces without embedding repo-specific assumptions into the skill itself.

## Validation

Validate the consumer contract with `npm run validate-input-contract -- --contract <consumer>/.codex/repo-intake-inputs.json`.
