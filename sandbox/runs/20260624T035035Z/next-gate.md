# Next Gate

## Recommended Next Slice

**Pi Tier-1 Dry Run Execution Slice**

## Required Before Execution Slice Starts

| Item | Required Action |
|------|----------------|
| `MINIMAX_API_KEY` in shell | Owner loads key into shell (e.g. `source .env`) without outputting value; boolean re-check confirms MINIMAX_API_KEY_PRESENT |
| `.gitignore` committed | Owner commits `.gitignore` change: `git add .gitignore && git commit -m "chore: add .env to .gitignore"` |

## Execution Slice Scope

- Session type: Tier 1 / `draft_only_generation`
- Skill: `pi.tier1.docs_draft`
- Command: `pi --provider minimax --model MiniMax-M3 --no-session --no-tools --print "<bounded prompt>"`
- Output: stdout captured to evidence or draft file in `sandbox/runs/20260624T035035Z/` or `docs/proposals/`
- Evidence: complete the 8 artifacts in `sandbox/runs/20260624T035035Z/` with actual run content
- No automatic commit of Pi output
- No canonical write without a separate promotion slice
- Human Approval required before any promotion
