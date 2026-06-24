# Commands Run

## Pre-Check Commands

| Command | Purpose | Exit Code |
|---------|---------|-----------|
| `git status --short` | Working tree state | 0 |
| `test -f .env && echo ENV_FILE_PRESENT` | .env presence (metadata only) | 0 |
| `git check-ignore -q .env && echo ENV_GITIGNORED` | .env gitignore coverage | 0 |
| `git ls-files --error-unmatch .env` | .env tracking check | 1 (not tracked — expected) |
| `git status --short -- .env` | .env git status | 0 (no output) |
| `command -v pi` | Pi CLI in PATH | 0 |
| `pi --version` | Pi CLI version | 0 → `0.79.9` |
| `[ -n "${MINIMAX_API_KEY:-}" ]` | Shell boolean key check | 1 (missing in subshell — skipped per owner directive; connectivity proof 89d193e accepted) |
| `date -u +%Y%m%dT%H%M%SZ` | Timestamp | 0 → `20260624T043216Z` |
| `mkdir -p sandbox/runs/20260624T043216Z` | Create evidence directory | 0 |

## Pi Execution Command (exactly one)

```
pi --provider minimax --model MiniMax-M3 --no-session --no-tools --print '<approved bounded prompt>'
```

- Provider: `minimax`
- Model: `MiniMax-M3`
- Flags: `--no-session --no-tools --print`
- No `--api-key` flag
- Auth: MINIMAX_API_KEY via .env (read by Pi directly; not read by this slice)
- Exit code: 0

Output saved to: `sandbox/runs/20260624T043216Z/pi-output.md`

No secrets in command or output. No second Pi invocation.
