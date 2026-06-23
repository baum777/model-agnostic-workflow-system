# Pi Tier-1 Draft Proposal Promotion Decision

## Class

decision / docs-only / proposal-promotion decision

## Status

accepted for separate promotion slice — no promotion executed

## Reviewed Proposal

```text
docs/proposals/pi-tier1-docs-draft-proposal.md
```

## Review Evidence

```text
docs/proposals/pi-tier1-docs-draft-proposal-review.md
commit caa278f
```

## Decision

```text
promote
```

```text
Decision: promote in a separate owner-approved promotion slice.
Target path: docs/pi-tier-1-draft-workflow.md
```

## Rationale

- Draft was reviewed as `promotable` with all 11 criteria passing (commit `caa278f`).
- Pre-promotion gaps (evidence schema drift, `--no-tools` enforcement) were closed by `396f41b` before review.
- Content captures Tier-1 hard constraints, canonical evidence boundary, and promotion gate rules — appropriate as a first canonical workflow doc.
- Keeping it as proposal-only would leave the first completed Tier-1 run without a canonical output, defeating the purpose of the workflow proof of concept.
- Target path `docs/pi-tier-1-draft-workflow.md` is appropriate: the proposal describes a Tier-1 workflow pattern, not runtime surface policy, not a skill schema, not a sandbox plan.
- Promotion is not executed in this slice.
- No runtime code.
- No Vault write.
- No provider adapter.
- No automatic truth promotion.
- Target path is canonical only after a separate promotion slice executes.

## Promotion Preconditions

A later promotion slice must:

1. Be owner-approved.
2. Name exactly: source `docs/proposals/pi-tier1-docs-draft-proposal.md` and target `docs/pi-tier-1-draft-workflow.md`.
3. Copy only the proposal content into the target path — no additions without explicit scope.
4. Not delete the source proposal file.
5. Update evidence: add a new `sandbox/runs/<timestamp>/` run for the promotion slice.
6. Not change any runtime surface files.
7. Not change any Vault files.
8. Not include any secrets.
9. Not create `providers/pi/`.
10. Have its own verification and commit.

## Recommended Next Gate

```text
Pi Tier-1 Draft Proposal Promotion Slice
```

Source: `docs/proposals/pi-tier1-docs-draft-proposal.md`
Target: `docs/pi-tier-1-draft-workflow.md`
Mode: docs-only copy, no content additions, owner-approved.
