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
- `domainGlossaryPaths`
- `adrPaths`
- `issueTrackerDocs`
- `triageLabelDocs`

## Contract Rules

- `skill` must be `repo-intake-sot-mapper`
- `repoRoot` must be `.` so the contract stays consumer-local
- all array fields must contain strings
- `canonicalSourceFiles`, `primaryDocs`, `governanceFiles`, `likelyEntrypoints`, `testCommands`, and `ignorePaths` must be non-empty
- `ignorePaths` must include `.git`, `node_modules`, `dist`, and `coverage`
- `journalPaths`, `dailyNotePaths`, `evidenceLogPaths`, `domainGlossaryPaths`, `adrPaths`, `issueTrackerDocs`, and `triageLabelDocs` are optional; when provided, each must be a non-empty array of strings
- any provided path in `journalPaths`, `dailyNotePaths`, `evidenceLogPaths`, `domainGlossaryPaths`, `adrPaths`, `issueTrackerDocs`, and `triageLabelDocs` must exist in the consumer repo

## Purpose

The contract tells the shared skill where to look for canonical source documents, governance files, likely entrypoints, test commands, optional journal/daily/evidence surfaces, and optional local context surfaces without embedding repo-specific assumptions into the skill itself.

The optional local context fields have narrow meanings:

- `domainGlossaryPaths`: project vocabulary or domain-language docs that help skills use repo-native terms.
- `adrPaths`: architectural decision records or equivalent decision logs that should not be re-litigated without evidence.
- `issueTrackerDocs`: repo-local issue tracker conventions, including GitHub, GitLab, local markdown, or other workflow notes.
- `triageLabelDocs`: repo-local triage state and label vocabulary mappings.

## Validation

Validate the consumer contract with `npm run validate-input-contract -- --contract <consumer>/.codex/repo-intake-inputs.json`.
