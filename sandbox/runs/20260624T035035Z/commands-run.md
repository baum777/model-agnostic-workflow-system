# Commands Run

## Preparation Slice Commands (actually executed)

| Command | Purpose | Exit Code |
|---------|---------|-----------|
| `git status --short` | Pre-check: working tree state | 0 |
| `test -f .env && echo ENV_FILE_PRESENT` | .env presence check (metadata only) | 0 |
| `git check-ignore -q .env && echo ENV_GITIGNORED` | .env gitignore coverage | 0 |
| `git ls-files --error-unmatch .env` | .env tracking check | 1 (not tracked — expected) |
| `git status --short -- .env` | .env git status | 0 (no output) |
| `command -v pi` | Pi CLI in PATH | 0 |
| `pi --version` | Pi CLI version | 0 → `0.79.9` |
| `[ -n "${MINIMAX_API_KEY:-}" ]` | Key boolean check (no value) | 1 (missing in shell) |
| `date -u +%Y%m%dT%H%M%SZ` | Timestamp for run folder | 0 → `20260624T035035Z` |
| `mkdir -p sandbox/runs/20260624T035035Z` | Create evidence directory | 0 |
| `npm run validate-baumos-contracts` | Contract validator | 0 → 5/5 PASS |

No secrets accessed. No `.env` read. No Pi session. No provider call. No network.

## Planned Pi Command (Execution Slice only — NOT YET EXECUTED)

```
planned_command:
  pi \
    --provider minimax \
    --model MiniMax-M3 \
    --no-session \
    --no-tools \
    --print \
    "<bounded Tier-1 draft-only prompt — to be defined in Execution Slice>"
```

Status: **planned only** — will be executed in the separate Pi Tier-1 Dry Run Execution Slice
after all preconditions are confirmed pass, including MINIMAX_API_KEY available in shell.
