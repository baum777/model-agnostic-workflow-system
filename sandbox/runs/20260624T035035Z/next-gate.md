# Next Gate

## Recommended Next Slice

**Pi Tier-1 Dry Run Execution Slice (Real Bounded Prompt)**

## What This Run Proved

- Pi CLI `0.79.9` reaches `minimax/MiniMax-M3` successfully
- Command shape `--no-tools --no-session --print` is confirmed working
- `MINIMAX_API_KEY` is loadable and accepted by the provider
- Tier 0/1 boundary is enforced: no tools, no session, output to stdout only
- Exit code 0; clean run

## What Remains

The placeholder prompt `<bounded prompt>` produced a meta-response, not a Tier-1
draft document. A real Tier-1 run requires a concrete bounded prompt that produces
actual Markdown draft output for human review.

## Proposed Prompt for Next Run

Suggested scope (owner to confirm in OWNER_APPROVAL):

> "Generate a brief Markdown summary (20-30 lines) of the Baum-OS Pi governance
> cycle completed in v0.2-pre-runtime: the four expanded runtime surfaces
> (session-policy, evidence-contract, smoke-command, handoff), the closure verdict,
> and the pre-dry-run gate results. Draft only — not canonical."

Output path: `sandbox/runs/<new-timestamp>/pi-output.md` or stdout captured to evidence.

## Required Before Next Run

| Item | Required Action |
|------|----------------|
| Owner Approval | New OWNER_APPROVAL: string for Execution Slice |
| Bounded prompt | Confirmed concrete prompt (not a placeholder) |
| MINIMAX_API_KEY in shell | Confirm with boolean check before running |
| `.gitignore` committed | Confirm `git check-ignore .env` + committed state |
| New evidence folder | `sandbox/runs/<new-timestamp>/` — or continue in this folder |

## Execution Constraints (unchanged)

```
pi --provider minimax --model MiniMax-M3 --no-session --no-tools --print "<real bounded prompt>"
```

- No `--api-key` flag
- Auth via `.env` loaded in shell
- No automatic commit of Pi output
- No canonical write without a promotion slice
- Human Approval required before any promotion
