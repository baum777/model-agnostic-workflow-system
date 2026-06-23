# Risks / Gaps

1. **Pi output references `meta.json` and `logs/events.jsonl`** — the generated proposal describes an evidence structure that differs slightly from the bootstrapped `sandbox/runs/run-evidence-template.md`. The proposal is non-canonical draft; no action needed in this slice, but the discrepancy should be noted before any promotion.

2. **Draft not reviewed** — `docs/proposals/pi-tier1-docs-draft-proposal.md` is non-canonical and requires owner review before any promotion slice. No runtime impact in current state.

3. **`--no-tools` not used** — the Tier-1 command did not include `--no-tools` (unlike the Tier-0 smoke). Pi generated text-only output without invoking tools, but the flag was not enforced. Future Tier-1 runs should consider whether `--no-tools` is appropriate or whether `allowed_tools` should be enforced at the Pi call level.
