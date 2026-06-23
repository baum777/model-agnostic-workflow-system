# Pi Smoke Command

## Status
documented smoke command — no execution in this file

## Approved Smoke Evidence
The first accepted Tier-0 smoke is recorded in:

`docs/pi-smoke-run-evidence.md`

Commit:

`bdcc4b5`

Observed successful marker:

`PI_SMOKE_OK`

## Approved Shape
Future smoke commands must use:
- `--no-tools`
- `--no-session`
- `--print`
- approved provider/model
- no `--api-key`
- no mutation
- no `.env` output

## Current Smoke Provider / Model
- Provider: `minimax`
- Model: `MiniMax-M3`

## Forbidden
- open-ended Pi sessions
- `bash`, `edit`, `write`
- `--api-key`
- secrets in command or output
- provider calls from sandbox environments
