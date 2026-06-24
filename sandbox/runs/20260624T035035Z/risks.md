# Risks / Gaps

## Open Risks

| Risk | Severity | Detail |
|------|---------|--------|
| `MINIMAX_API_KEY` not in shell | **medium** | Boolean check: MINIMAX_API_KEY_MISSING. Key is owner-confirmed via `.env`, but not loaded into current shell. The Execution Slice will fail if key is not exported before Pi runs. Operator must `source .env` or otherwise load the key before the Execution Slice — without outputting the value. |
| `.gitignore` not yet committed | **low** | Owner modified `.gitignore` to add `.env` but has not committed the change. The gitignore rule is active (confirmed via `git check-ignore`) but could be lost on a `git checkout` or `git restore`. Owner should commit before the Execution Slice. |

## Non-Risks

- Evidence scaffold files are preparation-only; no Pi output has been fabricated
- No secret was exposed; no `.env` was read
- All governance surfaces are intact; no boundary was crossed
