# Risks / Gaps

## Open Risks

| Risk | Severity | Detail |
|------|---------|--------|
| Pi output references workspace paths not in this repo | low | `pi-output.md` mentions `agentic_workflow/portfolio/repo-audit.md` and `agentic_workflow/audit/` — these reflect Pi's broader Baum-OS workspace context, not necessarily this repo's canonical paths. Output is draft-only and not canonical; human review required before any promotion. |
| Shell boolean key check skipped | low | `MINIMAX_API_KEY` was not confirmed in the Claude Code subshell (structural limitation). Mitigated by: (a) owner directive, (b) connectivity proof `89d193e`, (c) successful provider response in this run. |

## Non-Risks

- No secret was exposed; no `.env` was read by this slice
- Tier boundary was fully maintained (`--no-tools --no-session --print`)
- No tools were invoked; no session persisted; no files written by Pi
- Output explicitly disclaims production runtime, CI, Vault, provider module, autonomous loop
- Output is clearly marked draft-only
